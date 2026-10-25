import { eq, and, max } from "drizzle-orm";
import * as schema from '../database/schema';
import { db, decrypt, getUserBySession } from "./utils";

/**
 * Returns if a teacher's session (sid) has ownership of a class
 * with the given classId
 * 
 * @param classId 
 * @param sid 
 * @returns 
 */
async function CheckClassOwnership(classId: string, sid: string) {
    try {
        const sessid = decrypt(sid);
        if (!sessid) return undefined;
        return true;
    } catch (e) {
        console.error("[CHECK-CLASS-OWNERSHIP Err]", e);
        return false;
    }
}

// one row per user, using their highest-privilege role
const topRole = max(schema.userRoles.roleid);

export async function AddStudent(email: string, classId: string, section: string, sid: string) {
    try {
        if (!CheckClassOwnership(classId, sid)) {
            return {
                "success": false,
                "message": "Modification Denied"
            }
        }

        const [student] = await db.select({
            id: schema.users.id,
            firstName: schema.users.firstName,
            middleInitial: schema.users.middleInitial,
            lastName: schema.users.lastName,
            email: schema.users.email,
            roleId: topRole,
        }).from(schema.users)
            .leftJoin(schema.userRoles, eq(schema.userRoles.userid, schema.users.id))
            .groupBy(schema.users.id)
            .where(and(
                eq(schema.users.email, email),
                eq(schema.userRoles.roleid, 1) // only grab students
            )).limit(1);
        if (!student) {
            return {
                "success": false,
                "message": "Student does not Exist"
            }
        }

        // student exists, insert into specific class
        await db.insert(schema.enrollments).values({
            studentid: student.id,
            classId: classId,
            sectionid: section
        });

        return {
            "success": true,
            "message": "Added Student Successfully"
        }
    } catch (e) {
        console.error("[ADD-STUDENT Err]", e);
        return {
            "success": false,
            "message": "Failed to Add Student"
        }
    }
}
export async function RemoveStudent(email: string, classId: string, section: string, sid: string) {
    try {
        if (!CheckClassOwnership(classId, sid)) {
            return {
                "success": false,
                "message": "Modification Denied"
            }
        }

        const [student] = await db.select({
            id: schema.users.id,
            firstName: schema.users.firstName,
            middleInitial: schema.users.middleInitial,
            lastName: schema.users.lastName,
            email: schema.users.email,
            roleId: topRole,
        }).from(schema.users)
            .leftJoin(schema.userRoles, eq(schema.userRoles.userid, schema.users.id))
            .groupBy(schema.users.id)
            .where(and(
                eq(schema.users.email, email),
                eq(schema.userRoles.roleid, 1) // only grab students
            )).limit(1);
        if (!student) {
            return {
                "success": false,
                "message": "Student not Found"
            }
        }

        await db.delete(schema.enrollments).where(and(
            eq(schema.enrollments.studentid, student.id),
            eq(schema.enrollments.sectionid, section),
            eq(schema.enrollments.classId, classId)
        ));

        return {
            "success": true,
            "message": "Removed Student Successfully"
        }
    } catch (e) {
        console.error("[REMOVE-STUDENT Err]", e);
        return {
            "success": false,
            "message": "Failed to Remove Student"
        }
    }
}

export async function GetClasses(sid: string) {
    try {
        const user = await getUserBySession(sid ?? "");
        if (!user) {
            return {
                "success": false,
                "message": "Access Denied"
            };
        }

        return db.select({
            classId: schema.classes.id,
            className: schema.classes.name,
            crn: schema.classes.crn,
            section: schema.sections.sectionid,
        }).from(schema.classes)
            .leftJoin(schema.sections, eq(schema.sections.classId, schema.classes.id))
            .groupBy(schema.classes.id);
    } catch (e) {
        console.error("[GET-CLASSES Err]", e);
        return [];
    }
}

export async function GetStudents(classId: string, section: string, sid: string) {
    try {
        if (!CheckClassOwnership(classId, sid)) {
            return {
                "success": false,
                "students": []
            }
        }

        const students = await db.select({
            id: schema.users.id,
            email: schema.users.email,
            firstName: schema.users.firstName,
            middleInitial: schema.users.middleInitial,
            lastName: schema.users.lastName,
        }).from(schema.users)
            .leftJoin(schema.enrollments, eq(schema.users.id, schema.enrollments.studentid))
            .groupBy(schema.users.id)
            .where(
                and(
                    eq(schema.enrollments.classId, classId),
                    eq(schema.enrollments.sectionid, section)
                )
            );

        /** @todo REMOVE THIS STMT */
        console.log({
            "classId": classId,
            "section": section,
            "students": students
        })

        return {
            "success": true,
            "students": students
        }
    } catch (e) {
        console.error("[GET-STUDENTS Err]", e);
        return {
            "success": false,
            "students": []
        }
    }
}


export async function AddClass(name: string, crn: string, section: string, sid: string) {
    try {
        await db.insert(schema.classes).ignore().values({
            crn: crn,
            name: name,
        });
        
        const [newClass] = await db.select().from(schema.classes).where(
            and(
                eq(schema.classes.crn, crn),
                eq(schema.classes.name, name)
            )
        ).limit(1);

        await AddSection(newClass.id, section, sid);

        return {
            "success": true,
            "message": "Added new Class Successfully"
        }
    } catch (e) {
        console.error("[ADD-CLASS Err]", e);
        return {
            "success": false,
            "message": "Failed to Add Class"
        }
    }
}
export async function RemoveClass(classId: string, sid: string) {
    try {
        if (!CheckClassOwnership(classId, sid)) {
            return {
                "success": false,
                "message": "Modification Denied"
            }
        }

        await db.delete(schema.classes).where(
            eq(schema.classes.id, classId)
        );

        return {
            "success": true,
            "message": "Removed Class Successfully"
        }
    } catch (e) {
        console.error("[REMOVE-CLASS Err]", e);
        return {
            "success": false,
            "message": "Failed to Remove Class"
        }
    }
}


export async function AddSection(classId: string, section: string, sid: string) {
    try {
        if (!CheckClassOwnership(classId, sid)) {
            return {
                "success": false,
                "message": "Modification Denied"
            }
        }

        const user = await getUserBySession(sid ?? "");
        if (!user) {
            return {
                "success": false,
                "message": "Access Denied"
            };
        }

        await db.insert(schema.sections).ignore().values({
            classId: classId,
            sectionid: section,
            lecturer: user.id,
        });
    } catch (e) {
        console.error("[ADD-SECTION Err]", e);
    }
}
export async function RemoveSection(classId: string, section:string, sid: string) {
    try {
        if (!CheckClassOwnership(classId, sid)) {
            return {
                "success": false,
                "message": "Modification Denied"
            }
        }

        await db.delete(schema.sections).where(
            and(
                eq(schema.sections.classId, classId),
                eq(schema.sections.sectionid, section)
            )
        );

        return {
            "success": true,
            "message": "Removed Section Successfully"
        }
    } catch (e) {
        console.error("[REMOVE-SECTION Err]", e);
        return {
            "success": false,
            "message": "Failed to Remove Section"
        }
    }
}
