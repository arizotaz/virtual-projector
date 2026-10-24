import {
    customType, foreignKey, int, mysqlTable,
    primaryKey, timestamp, varchar,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// MariaDB native UUID column (drizzle has no built-in `uuid` for mysql-core)
const uuid = customType<{ data: string }>({
    dataType: () => 'uuid',
});

export const users = mysqlTable('users', {
    id: uuid('id').primaryKey().default(sql`(uuid())`), // mariadb handles generation for us
    firstName: varchar('first_name', { length: 100 }).notNull(),
    middleInitial: varchar('middle_initial', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    email: varchar('email', { length: 100 }).notNull().unique(),
    password_hash: varchar('password_hash', { length: 64 }).notNull(), // sha-256 (temp)
});

export const accounts = mysqlTable('accounts', {
    id: int('id').autoincrement().primaryKey(),
    userid: uuid('userid').notNull()
        .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    username: varchar('username', { length: 255 }).notNull().unique('accounts_unique'),
    password: varchar('password', { length: 512 }).notNull(), // store a hash, never plaintext
});

export const roles = mysqlTable('roles', {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 256 }).notNull().unique('roles_unique'),
});

export const userRoles = mysqlTable('user_roles', {
    userid: uuid('userid').notNull()
        .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    roleid: int('roleid').notNull().references(() => roles.id),
});

export const classes = mysqlTable('classes', {
    crn: varchar('crn', { length: 32 }).primaryKey(),
    name: varchar('name', { length: 512 }).notNull(),
});

export const sections = mysqlTable('sections', {
    classCrn: varchar('class_crn', { length: 32 }).notNull()
        .references(() => classes.crn, { onDelete: 'cascade', onUpdate: 'cascade' }),
    sectionid: varchar('sectionid', { length: 5 }).notNull(),
    lecturer: uuid('lecturer').notNull().references(() => users.id),
}, (t) => [
    primaryKey({ columns: [t.classCrn, t.sectionid] }),
]);

export const enrollments = mysqlTable('enrollments', {
    studentid: uuid('studentid').notNull(), // no FK to users in the original schema
    classCrn: varchar('class_crn', { length: 32 }).notNull(),
    sectionid: varchar('sectionid', { length: 5 }).notNull(),
}, (t) => [
    primaryKey({ columns: [t.studentid, t.classCrn, t.sectionid] }),
    foreignKey({
        name: 'FK_enrollments_classes',
        columns: [t.classCrn, t.sectionid],
        foreignColumns: [sections.classCrn, sections.sectionid],
    }),
]);

export const sessions = mysqlTable('sessions', {
    sessionID: varchar('sessionID', { length: 255 }).primaryKey(),
    sessionKey: varchar('sessionKey', { length: 512 }).notNull(),
    userid: uuid('userid').notNull()
        .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    expiration: timestamp('expiration').notNull(),
    ipAddress: varchar('ipAddress', { length: 40 }),
});