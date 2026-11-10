-- Base tables and the fixed roles. Safe to re-run: it only creates what's missing.
-- `npm run db:init` runs this first, then auth.sql, classes.sql and admin.sql.

ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS users (
	id             uuid         NOT NULL DEFAULT uuid(),
	first_name     varchar(100) NOT NULL,
	middle_initial varchar(100) DEFAULT NULL,
	last_name      varchar(100) DEFAULT NULL,
	email          varchar(100) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- The code relies on these ids: a user's level is their highest role id
CREATE TABLE IF NOT EXISTS roles (
	id   int(11)      NOT NULL AUTO_INCREMENT,
	name varchar(256) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY roles_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

INSERT IGNORE INTO roles (id, name) VALUES
	(1, 'Student'),
	(2, 'Teacher'),
	(3, 'Administrator'),
	(4, 'Super');

CREATE TABLE IF NOT EXISTS user_roles (
	userid uuid    NOT NULL,
	roleid int(11) NOT NULL,
	UNIQUE KEY user_roles_unique (userid, roleid),
	KEY user_roles_roleid_roles_id_fk (roleid),
	CONSTRAINT user_roles_roleid_roles_id_fk FOREIGN KEY (roleid) REFERENCES roles (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
	CONSTRAINT user_roles_userid_users_id_fk FOREIGN KEY (userid) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Login credentials. A user with no row here can't log in.
CREATE TABLE IF NOT EXISTS accounts (
	id       int(11)      NOT NULL AUTO_INCREMENT,
	userid   uuid         NOT NULL,
	password varchar(512) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY accounts_userid_unique (userid),
	CONSTRAINT accounts_userid_users_id_fk FOREIGN KEY (userid) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- sessionKey is a SHA-256 hash of the cookie value
CREATE TABLE IF NOT EXISTS sessions (
	sessionID  varchar(256) NOT NULL,
	sessionKey varchar(512) NOT NULL,
	userid     uuid         NOT NULL,
	expiration timestamp    NOT NULL,
	ipAddress  varchar(40)  DEFAULT NULL,
	PRIMARY KEY (sessionID),
	KEY sessions_userid_users_id_fk (userid),
	CONSTRAINT sessions_userid_users_id_fk FOREIGN KEY (userid) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS classes (
	crn  varchar(32)  NOT NULL,
	name varchar(512) NOT NULL,
	PRIMARY KEY (crn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- department and shorthand are added by classes.sql
CREATE TABLE IF NOT EXISTS sections (
	crn       varchar(32) NOT NULL,
	sectionid varchar(5)  NOT NULL,
	lecturer  uuid        NOT NULL,
	PRIMARY KEY (crn, sectionid),
	KEY sections_lecturer_users_id_fk (lecturer),
	CONSTRAINT sections_crn_classes_crn_fk FOREIGN KEY (crn) REFERENCES classes (crn) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT sections_lecturer_users_id_fk FOREIGN KEY (lecturer) REFERENCES users (id) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- The studentid foreign key is added by admin.sql
CREATE TABLE IF NOT EXISTS enrollments (
	studentid uuid        NOT NULL,
	crn       varchar(32) NOT NULL,
	sectionid varchar(5)  NOT NULL,
	PRIMARY KEY (studentid, crn, sectionid),
	KEY FK_enrollments_sections (crn, sectionid),
	CONSTRAINT FK_enrollments_sections FOREIGN KEY (crn, sectionid) REFERENCES sections (crn, sectionid) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;