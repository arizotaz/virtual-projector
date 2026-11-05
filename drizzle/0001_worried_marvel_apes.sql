CREATE TABLE `urls` (
	`department` varchar(6) NOT NULL,
	`classname` varchar(24) NOT NULL,
	`crn` varchar(32) NOT NULL,
	`sectionid` varchar(5) NOT NULL,
	CONSTRAINT `urls_department_classname_pk` PRIMARY KEY(`department`,`classname`)
);
--> statement-breakpoint
ALTER TABLE `urls` ADD CONSTRAINT `FK_urls_sections` FOREIGN KEY (`crn`,`sectionid`) REFERENCES `sections`(`crn`,`sectionid`) ON DELETE cascade ON UPDATE cascade;