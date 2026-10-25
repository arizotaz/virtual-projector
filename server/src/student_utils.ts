import { eq, and, max } from "drizzle-orm";
import * as schema from '../database/schema';
import { db, getUserBySession } from "./utils";

export async function GetStudentEnrollments(sid: string) {
    try {
        const selfUser = await getUserBySession(sid);
        if (!selfUser) {
            return [];
        }

        const enrollments = await db.select({
            crn: schema.classes.crn,
            name: schema.classes.name,
            section: schema.sections.sectionid,
        })
            .from(schema.enrollments)
            .innerJoin(schema.sections, and(
                eq(schema.sections.crn, schema.enrollments.crn),
                eq(schema.sections.sectionid, schema.enrollments.sectionid),
            ))
            .innerJoin(schema.classes, eq(schema.classes.crn, schema.sections.crn))
            .where(eq(schema.enrollments.studentid, selfUser.id))
            .orderBy(schema.classes.crn, schema.sections.sectionid);

        return enrollments;
    } catch (e) {
        console.error("[GET-ENROLLMENTS Err]", e);
        return [];
    }
}