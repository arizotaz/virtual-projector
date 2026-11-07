-- Admin panel procedures. Safe to re-run. Applied by `npm run db:init`, after classes.sql.
--
-- Every procedure takes the caller's session and checks it itself. Passwords arrive already hashed.
--
-- Failures are raised with SIGNAL. The last three digits of the SQLSTATE are the HTTP status the
-- API responds with, and MESSAGE_TEXT is shown to the admin:
--   45400 invalid input, 45401 not logged in, 45403 not allowed, 45404 not found, 45409 conflict

-- Deleting a student shouldn't leave enrollments behind
ALTER TABLE enrollments
	ADD CONSTRAINT enrollments_studentid_users_id_fk FOREIGN KEY IF NOT EXISTS (studentid)
	REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE;

-- A user holds each role at most once
ALTER TABLE user_roles ADD UNIQUE KEY IF NOT EXISTS user_roles_unique (userid, roleid);

-- A user as the admin panel sees them. roles is a JSON array, or NULL with none.
CREATE OR REPLACE VIEW admin_users AS
SELECT u.id, u.first_name, u.middle_initial, u.last_name, u.email,
	EXISTS (SELECT 1 FROM accounts a WHERE a.userid = u.id) AS has_account,
	(SELECT JSON_ARRAYAGG(JSON_OBJECT('id', r.id, 'name', r.name))
	   FROM user_roles ur JOIN roles r ON r.id = ur.roleid
	  WHERE ur.userid = u.id) AS roles
FROM users u;

-- A section as the admin panel sees it
CREATE OR REPLACE VIEW admin_sections AS
SELECT s.crn, c.name AS class_name, s.sectionid, s.lecturer,
	CONCAT_WS(' ', t.first_name, t.middle_initial, t.last_name) AS lecturer_name,
	s.department, s.shorthand,
	(SELECT COUNT(*) FROM enrollments e WHERE e.crn = s.crn AND e.sectionid = s.sectionid) AS student_count
FROM sections s
JOIN classes c ON c.crn = s.crn
JOIN users t ON t.id = s.lecturer;

DELIMITER //

-- ---------------------------------------------------------------------------
-- Permission checks, called by every procedure below
-- ---------------------------------------------------------------------------

-- The caller must have a valid session and be an Administrator (role 3) or above
CREATE OR REPLACE PROCEDURE `admin.authorize`(
	IN  p_sessionID  varchar(256),
	IN  p_sessionKey varchar(512),
	OUT p_actor      UUID,
	OUT p_level      INT
)
BEGIN
	SET p_actor = NULL;
	SET p_level = NULL;

	SELECT s.userid, MAX(ur.roleid)
	  INTO p_actor, p_level
	  FROM sessions s
	  LEFT JOIN user_roles ur ON ur.userid = s.userid
	 WHERE s.sessionID = p_sessionID
	   AND BINARY s.sessionKey = p_sessionKey
	   AND s.expiration > NOW()
	 GROUP BY s.userid;

	IF p_actor IS NULL THEN
		SIGNAL SQLSTATE '45401' SET MESSAGE_TEXT = 'Not logged in';
	END IF;
	IF p_level IS NULL OR p_level < 3 THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'Permission denied';
	END IF;
END //

-- As above, and the target user must exist and not outrank the caller
CREATE OR REPLACE PROCEDURE `admin.authorizeTarget`(
	IN  p_sessionID  varchar(256),
	IN  p_sessionKey varchar(512),
	IN  p_target     UUID,
	OUT p_actor      UUID,
	OUT p_level      INT
)
BEGIN
	CALL `admin.authorize`(p_sessionID, p_sessionKey, p_actor, p_level);

	IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'User not found';
	END IF;
	IF (SELECT MAX(roleid) FROM user_roles WHERE userid = p_target) > p_level THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'You can''t manage a user with a higher role than yours';
	END IF;
END //

CREATE OR REPLACE PROCEDURE `admin.validateUser`(
	IN p_first varchar(100),
	IN p_last  varchar(100),
	IN p_email varchar(100)
)
BEGIN
	IF TRIM(IFNULL(p_first, '')) = '' OR TRIM(IFNULL(p_last, '')) = '' THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'First and last name are required';
	END IF;
	IF IFNULL(p_email, '') NOT LIKE '_%@_%' THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'A valid email is required';
	END IF;
END //

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE `admin.stats`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT
		(SELECT COUNT(*) FROM users) AS users,
		(SELECT COUNT(DISTINCT userid) FROM user_roles WHERE roleid = 1) AS students,
		(SELECT COUNT(DISTINCT userid) FROM user_roles WHERE roleid = 2) AS teachers,
		(SELECT COUNT(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.userid = u.id)) AS users_without_account,
		(SELECT COUNT(*) FROM classes) AS classes,
		(SELECT COUNT(*) FROM sections) AS sections,
		(SELECT COUNT(*) FROM enrollments) AS enrollments;
END //

CREATE OR REPLACE PROCEDURE `admin.roles.list`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT id, name FROM roles ORDER BY id;
END //

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

-- p_search matches name or email; p_roleid limits to one role. NULL or '' means no filter.
CREATE OR REPLACE PROCEDURE `admin.users.list`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_search     varchar(255),
	IN p_roleid     INT
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT u.*
	  FROM admin_users u
	 WHERE (IFNULL(p_search, '') = ''
	        OR CONCAT_WS(' ', u.first_name, u.middle_initial, u.last_name) LIKE CONCAT('%', p_search, '%')
	        OR u.email LIKE CONCAT('%', p_search, '%'))
	   AND (p_roleid IS NULL
	        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.userid = u.id AND ur.roleid = p_roleid))
	 ORDER BY u.last_name, u.first_name, u.email;
END //

CREATE OR REPLACE PROCEDURE `admin.user.get`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_id) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'User not found';
	END IF;

	SELECT * FROM admin_users WHERE id = p_id;
END //

-- Creates a user, and optionally their first role and login in the same step
CREATE OR REPLACE PROCEDURE `admin.user.create`(
	IN p_sessionID    varchar(256),
	IN p_sessionKey   varchar(512),
	IN p_first        varchar(100),
	IN p_middle       varchar(100),
	IN p_last         varchar(100),
	IN p_email        varchar(100),
	IN p_roleid       INT,
	IN p_passwordHash varchar(512)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	DECLARE v_id    UUID DEFAULT UUID();

	DECLARE EXIT HANDLER FOR 1062
	BEGIN
		ROLLBACK;
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'A user with that email already exists';
	END;
	DECLARE EXIT HANDLER FOR SQLEXCEPTION
	BEGIN
		ROLLBACK;
		RESIGNAL;
	END;

	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);
	CALL `admin.validateUser`(p_first, p_last, p_email);
	IF p_roleid > v_level THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'You can''t give a role higher than your own';
	END IF;

	START TRANSACTION;
	INSERT INTO users (id, first_name, middle_initial, last_name, email)
	VALUES (v_id, TRIM(p_first), NULLIF(TRIM(p_middle), ''), TRIM(p_last), TRIM(p_email));
	IF p_roleid IS NOT NULL THEN
		INSERT INTO user_roles (userid, roleid) VALUES (v_id, p_roleid);
	END IF;
	IF p_passwordHash IS NOT NULL THEN
		INSERT INTO accounts (userid, password) VALUES (v_id, p_passwordHash);
	END IF;
	COMMIT;

	SELECT v_id AS id;
END //

CREATE OR REPLACE PROCEDURE `admin.user.update`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID,
	IN p_first      varchar(100),
	IN p_middle     varchar(100),
	IN p_last       varchar(100),
	IN p_email      varchar(100)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1062
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'A user with that email already exists';

	CALL `admin.authorizeTarget`(p_sessionID, p_sessionKey, p_id, v_actor, v_level);
	CALL `admin.validateUser`(p_first, p_last, p_email);

	UPDATE users
	   SET first_name = TRIM(p_first),
	       middle_initial = NULLIF(TRIM(p_middle), ''),
	       last_name = TRIM(p_last),
	       email = TRIM(p_email)
	 WHERE id = p_id;
END //

-- Their account, roles, sessions and enrollments go with them
CREATE OR REPLACE PROCEDURE `admin.user.delete`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1451
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'This user teaches one or more sections. Assign those a new teacher first';

	CALL `admin.authorizeTarget`(p_sessionID, p_sessionKey, p_id, v_actor, v_level);
	IF p_id = v_actor THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'You can''t delete yourself';
	END IF;

	DELETE FROM users WHERE id = p_id;
END //

CREATE OR REPLACE PROCEDURE `admin.user.addRole`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID,
	IN p_roleid     INT
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorizeTarget`(p_sessionID, p_sessionKey, p_id, v_actor, v_level);

	IF p_roleid > v_level THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'You can''t give a role higher than your own';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM roles WHERE id = p_roleid) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Role not found';
	END IF;

	INSERT IGNORE INTO user_roles (userid, roleid) VALUES (p_id, p_roleid);
END //

CREATE OR REPLACE PROCEDURE `admin.user.removeRole`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID,
	IN p_roleid     INT
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorizeTarget`(p_sessionID, p_sessionKey, p_id, v_actor, v_level);

	-- An admin can't lock themselves out of the admin panel
	IF p_id = v_actor AND IFNULL((SELECT MAX(roleid) FROM user_roles WHERE userid = p_id AND roleid <> p_roleid), 0) < 3 THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'You can''t remove your own admin access';
	END IF;

	DELETE FROM user_roles WHERE userid = p_id AND roleid = p_roleid;
END //

-- ---------------------------------------------------------------------------
-- Accounts (logins)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE `admin.account.create`(
	IN p_sessionID    varchar(256),
	IN p_sessionKey   varchar(512),
	IN p_id           UUID,
	IN p_passwordHash varchar(512)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1062
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'This user already has an account';

	CALL `admin.authorizeTarget`(p_sessionID, p_sessionKey, p_id, v_actor, v_level);

	INSERT INTO accounts (userid, password) VALUES (p_id, p_passwordHash);
END //

-- Logs the user out everywhere, except the session making this change
CREATE OR REPLACE PROCEDURE `admin.account.setPassword`(
	IN p_sessionID    varchar(256),
	IN p_sessionKey   varchar(512),
	IN p_id           UUID,
	IN p_passwordHash varchar(512)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorizeTarget`(p_sessionID, p_sessionKey, p_id, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM accounts WHERE userid = p_id) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'This user has no account';
	END IF;

	UPDATE accounts SET password = p_passwordHash WHERE userid = p_id;
	DELETE FROM sessions WHERE userid = p_id AND sessionID <> p_sessionID;
END //

-- Removes the login and ends their sessions. The user record stays.
CREATE OR REPLACE PROCEDURE `admin.account.delete`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorizeTarget`(p_sessionID, p_sessionKey, p_id, v_actor, v_level);

	IF p_id = v_actor THEN
		SIGNAL SQLSTATE '45403' SET MESSAGE_TEXT = 'You can''t delete your own account';
	END IF;

	DELETE FROM accounts WHERE userid = p_id;
	DELETE FROM sessions WHERE userid = p_id;
END //

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE `admin.classes.list`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_search     varchar(255)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT c.crn, c.name,
		(SELECT COUNT(*) FROM sections s WHERE s.crn = c.crn) AS section_count,
		(SELECT COUNT(DISTINCT e.studentid) FROM enrollments e WHERE e.crn = c.crn) AS student_count
	  FROM classes c
	 WHERE IFNULL(p_search, '') = ''
	    OR c.crn LIKE CONCAT('%', p_search, '%')
	    OR c.name LIKE CONCAT('%', p_search, '%')
	 ORDER BY c.name, c.crn;
END //

CREATE OR REPLACE PROCEDURE `admin.class.get`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM classes WHERE crn = p_crn) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Class not found';
	END IF;

	SELECT crn, name FROM classes WHERE crn = p_crn;
END //

CREATE OR REPLACE PROCEDURE `admin.class.create`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_name       varchar(512)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1062
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'A class with that CRN already exists';

	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF TRIM(IFNULL(p_crn, '')) = '' OR TRIM(IFNULL(p_name, '')) = '' THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'CRN and name are required';
	END IF;
	IF TRIM(p_crn) NOT REGEXP '^[A-Za-z]' THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'A CRN must start with its department letters, like CS63005';
	END IF;

	INSERT INTO classes (crn, name) VALUES (TRIM(p_crn), TRIM(p_name));
END //

CREATE OR REPLACE PROCEDURE `admin.class.update`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_name       varchar(512)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM classes WHERE crn = p_crn) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Class not found';
	END IF;
	IF TRIM(IFNULL(p_name, '')) = '' THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'Name is required';
	END IF;

	UPDATE classes SET name = TRIM(p_name) WHERE crn = p_crn;
END //

-- Its sections and enrollments go with it
CREATE OR REPLACE PROCEDURE `admin.class.delete`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	DELETE FROM classes WHERE crn = p_crn;
END //

-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------

-- p_crn and p_sectionid narrow the list. NULL means no filter.
CREATE OR REPLACE PROCEDURE `admin.sections.list`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT *
	  FROM admin_sections s
	 WHERE (p_crn IS NULL OR s.crn = p_crn)
	   AND (p_sectionid IS NULL OR s.sectionid = p_sectionid)
	 ORDER BY s.class_name, s.crn, s.sectionid;
END //

CREATE OR REPLACE PROCEDURE `admin.section.create`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5),
	IN p_lecturer   UUID
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1062
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'That section already exists';

	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF TRIM(IFNULL(p_sectionid, '')) = '' THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'Section ID is required';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM classes WHERE crn = p_crn) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Class not found';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM user_roles WHERE userid = p_lecturer AND roleid = 2) THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'That user is not a teacher';
	END IF;

	INSERT INTO sections (crn, sectionid, lecturer) VALUES (p_crn, TRIM(p_sectionid), p_lecturer);
END //

CREATE OR REPLACE PROCEDURE `admin.section.setTeacher`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5),
	IN p_lecturer   UUID
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM sections WHERE crn = p_crn AND sectionid = p_sectionid) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Section not found';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM user_roles WHERE userid = p_lecturer AND roleid = 2) THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'That user is not a teacher';
	END IF;

	UPDATE sections SET lecturer = p_lecturer WHERE crn = p_crn AND sectionid = p_sectionid;
END //

-- Replaced by shorthands on the section
DROP PROCEDURE IF EXISTS `admin.section.setUrl` //

-- Whether a section could use this shorthand, checked as an admin types it.
-- status is available, current (already this section's), taken or invalid.
CREATE OR REPLACE PROCEDURE `admin.section.shorthandStatus`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5),
	IN p_shorthand  varchar(255)
)
BEGIN
	DECLARE v_actor      UUID;
	DECLARE v_level      INT;
	DECLARE v_department varchar(32);
	DECLARE v_current    varchar(32);
	DECLARE v_taken_by   varchar(600) DEFAULT NULL;

	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM sections WHERE crn = p_crn AND sectionid = p_sectionid) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Section not found';
	END IF;

	SELECT department, shorthand INTO v_department, v_current
	  FROM sections WHERE crn = p_crn AND sectionid = p_sectionid;

	SELECT CONCAT(c.name, ' (', s.crn, ') section ', s.sectionid) INTO v_taken_by
	  FROM sections s JOIN classes c ON c.crn = s.crn
	 WHERE s.department = v_department AND s.shorthand = p_shorthand
	   AND NOT (s.crn = p_crn AND s.sectionid = p_sectionid)
	 LIMIT 1;

	IF IFNULL(p_shorthand, '') NOT REGEXP '^[A-Za-z0-9_-]+$' THEN
		SELECT 'invalid' AS status, 'Only letters, numbers, - and _ are allowed' AS message;
	ELSEIF CHAR_LENGTH(p_shorthand) > 32 THEN
		SELECT 'invalid' AS status, 'Must be 32 characters or fewer' AS message;
	ELSEIF v_taken_by IS NOT NULL THEN
		SELECT 'taken' AS status, CONCAT('Already used in ', v_department, ' by ', v_taken_by) AS message;
	ELSEIF p_shorthand = v_current THEN
		SELECT 'current' AS status, 'This is the current address' AS message;
	ELSE
		SELECT 'available' AS status, CONCAT('Available in ', v_department) AS message;
	END IF;
END //

-- Blank removes the address. The unique key settles who gets a name if two admins save at once.
CREATE OR REPLACE PROCEDURE `admin.section.setShorthand`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5),
	IN p_shorthand  varchar(32)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1062
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'That shorthand is already used in this department';

	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM sections WHERE crn = p_crn AND sectionid = p_sectionid) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Section not found';
	END IF;
	IF IFNULL(p_shorthand, '') <> '' AND p_shorthand NOT REGEXP '^[A-Za-z0-9_-]+$' THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'Only letters, numbers, - and _ are allowed';
	END IF;

	UPDATE sections
	   SET shorthand = NULLIF(p_shorthand, '')
	 WHERE crn = p_crn AND sectionid = p_sectionid;
END //

-- Its enrollments and shorthand go with it
CREATE OR REPLACE PROCEDURE `admin.section.delete`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	DELETE FROM sections WHERE crn = p_crn AND sectionid = p_sectionid;
END //

-- ---------------------------------------------------------------------------
-- Enrollments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE `admin.section.students`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT u.*
	  FROM enrollments e
	  JOIN admin_users u ON u.id = e.studentid
	 WHERE e.crn = p_crn AND e.sectionid = p_sectionid
	 ORDER BY u.last_name, u.first_name, u.email;
END //

-- The sections a user is enrolled in
CREATE OR REPLACE PROCEDURE `admin.user.enrollments`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT s.*
	  FROM enrollments e
	  JOIN admin_sections s ON s.crn = e.crn AND s.sectionid = e.sectionid
	 WHERE e.studentid = p_id
	 ORDER BY s.class_name, s.crn, s.sectionid;
END //

-- The sections a user teaches
CREATE OR REPLACE PROCEDURE `admin.user.teaching`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_id         UUID
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	SELECT *
	  FROM admin_sections s
	 WHERE s.lecturer = p_id
	 ORDER BY s.class_name, s.crn, s.sectionid;
END //

CREATE OR REPLACE PROCEDURE `admin.enrollment.add`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_studentid  UUID,
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;

	DECLARE EXIT HANDLER FOR 1062
		SIGNAL SQLSTATE '45409' SET MESSAGE_TEXT = 'That student is already enrolled in this section';

	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	IF NOT EXISTS (SELECT 1 FROM user_roles WHERE userid = p_studentid AND roleid = 1) THEN
		SIGNAL SQLSTATE '45400' SET MESSAGE_TEXT = 'That user is not a student';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM sections WHERE crn = p_crn AND sectionid = p_sectionid) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Section not found';
	END IF;

	INSERT INTO enrollments (studentid, crn, sectionid) VALUES (p_studentid, p_crn, p_sectionid);
END //

CREATE OR REPLACE PROCEDURE `admin.enrollment.remove`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_studentid  UUID,
	IN p_crn        varchar(32),
	IN p_sectionid  varchar(5)
)
BEGIN
	DECLARE v_actor UUID;
	DECLARE v_level INT;
	CALL `admin.authorize`(p_sessionID, p_sessionKey, v_actor, v_level);

	DELETE FROM enrollments
	 WHERE studentid = p_studentid AND crn = p_crn AND sectionid = p_sectionid;
END //

DELIMITER ;
