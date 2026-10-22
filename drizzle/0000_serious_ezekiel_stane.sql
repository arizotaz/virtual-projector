CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userid` uuid NOT NULL,
	`username` varchar(255) NOT NULL,
	`password` varchar(512) NOT NULL,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`crn` varchar(32) NOT NULL,
	`name` varchar(512) NOT NULL,
	CONSTRAINT `classes_crn` PRIMARY KEY(`crn`)
);
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`studentid` uuid NOT NULL,
	`class_crn` varchar(32) NOT NULL,
	`sectionid` varchar(5) NOT NULL,
	CONSTRAINT `enrollments_studentid_class_crn_sectionid_pk` PRIMARY KEY(`studentid`,`class_crn`,`sectionid`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`class_crn` varchar(32) NOT NULL,
	`sectionid` varchar(5) NOT NULL,
	`lecturer` uuid NOT NULL,
	CONSTRAINT `sections_class_crn_sectionid_pk` PRIMARY KEY(`class_crn`,`sectionid`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`sessionID` varchar(255) NOT NULL,
	`sessionKey` varchar(512) NOT NULL,
	`userid` uuid NOT NULL,
	`expiration` timestamp NOT NULL,
	`ipAddress` varchar(40),
	CONSTRAINT `sessions_sessionID` PRIMARY KEY(`sessionID`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`userid` uuid NOT NULL,
	`roleid` int NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` uuid NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`middle_initial` varchar(100),
	`last_name` varchar(100),
	`email` varchar(100) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_userid_users_id_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `enrollments` ADD CONSTRAINT `FK_enrollments_classes` FOREIGN KEY (`class_crn`,`sectionid`) REFERENCES `sections`(`class_crn`,`sectionid`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sections` ADD CONSTRAINT `sections_class_crn_classes_crn_fk` FOREIGN KEY (`class_crn`) REFERENCES `classes`(`crn`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sections` ADD CONSTRAINT `sections_lecturer_users_id_fk` FOREIGN KEY (`lecturer`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userid_users_id_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userid_users_id_fk` FOREIGN KEY (`userid`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleid_roles_id_fk` FOREIGN KEY (`roleid`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;