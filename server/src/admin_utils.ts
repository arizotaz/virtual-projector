import { eq, asc, desc, max } from "drizzle-orm";
import * as schema from '../database/schema';
import { db, getUserBySession, roles } from "./utils";

const PAGE_SIZE = 10;
export async function GetUsers(page: number) {
    try {
        const safePage = Number.isInteger(page) && page > 0 ? page : 1;

        // one row per user, using their highest-privilege role
        const topRole = max(schema.userRoles.roleid);

        const rows = await db.select({
            id: schema.users.id,
            firstName: schema.users.firstName,
            middleInitial: schema.users.middleInitial,
            lastName: schema.users.lastName,
            email: schema.users.email,
            roleId: topRole,
        }).from(schema.users)
            .leftJoin(schema.userRoles, eq(schema.userRoles.userid, schema.users.id))
            .groupBy(schema.users.id)
            .orderBy(desc(topRole), asc(schema.users.id)) // id breaks ties so pages are stable
            .limit(PAGE_SIZE)
            .offset((safePage - 1) * PAGE_SIZE);

        return rows.map(({ roleId, ...user }) => ({
            ...user,
            role: roles[roleId ?? 0] ?? roles[0],
        }));
    } catch (e) {
        console.error("[GET-USERS Err]", e);
        return [];
    }
}

export async function DeleteUser(uid: string, sid: string) {
    try {
        const topRole = max(schema.userRoles.roleid);
        const [user] = await db.select({
            id: schema.users.id,
            roleId: topRole,
        }).from(schema.users)
            .leftJoin(
                schema.userRoles,
                eq(schema.userRoles.userid, schema.users.id)
            ).where(eq(schema.users.id, uid)).limit(1);

        if (!user) {
            return {
                "success": false,
                "message": "User does not Exist"
            }
        }

        const selfUser = await getUserBySession(sid);
        if (!selfUser) {
            return {
                "success": false,
                "message": "Failed to Delete User"
            }
        } else if (user.id === selfUser.id) {
            return {
                "success": false,
                "message": "Cannot Self-Delete"
            }
        }

        if (roles[user.roleId ?? 0] === roles[4]) {
            return {
                "success": false,
                "message": "Cannot Delete Super-Admin"
            }
        }

        await db.delete(schema.users)
            .where(eq(schema.users.id, uid));

        return {
            "success": true,
            "message": "Deleted User Successfully"
        }
    } catch (e) {
        console.error("[DELETE-USER Err]", e);
        return {
            "success": false,
            "message": "Failed to Delete User"
        }
    }
}