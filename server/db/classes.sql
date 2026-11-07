-- Class addresses: /c/{department}/{shorthand}. Safe to re-run. Applied by `npm run db:init`, after auth.sql.
--
-- department is the letters at the start of the CRN (CS63005 is CS), so it can't drift from it.
-- shorthand is chosen per section, first come first served within a department. The unique key is
-- what enforces that, ignoring case, so two admins saving at once can't both get a name.

ALTER TABLE sections
	ADD COLUMN IF NOT EXISTS department varchar(32)
		GENERATED ALWAYS AS (UPPER(REGEXP_SUBSTR(crn, '^[A-Za-z]+'))) VIRTUAL,
	ADD COLUMN IF NOT EXISTS shorthand varchar(32) NULL,
	ADD UNIQUE KEY IF NOT EXISTS sections_department_shorthand_unique (department, shorthand);

DELIMITER //

-- The section at /c/{department}/{shorthand}. A NULL user is an anonymous visitor, who isn't shown the teacher's name.
CREATE OR REPLACE PROCEDURE `class.lookup`(
	IN p_department varchar(255),
	IN p_shorthand  varchar(255),
	IN p_userid     uuid
)
BEGIN
	IF NOT EXISTS (SELECT 1 FROM sections WHERE department = p_department AND shorthand = p_shorthand) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Class not found';
	END IF;

	SELECT s.crn, c.name AS class_name, s.sectionid, s.department, s.shorthand,
		IF(p_userid IS NULL, NULL, CONCAT_WS(' ', t.first_name, t.middle_initial, t.last_name)) AS lecturer_name,
		COALESCE(s.lecturer = p_userid, 0) AS is_lecturer
	  FROM sections s
	  JOIN classes c ON c.crn = s.crn
	  JOIN users t ON t.id = s.lecturer
	 WHERE s.department = p_department
	   AND s.shorthand = p_shorthand;
END //

-- For any logged in user
CREATE OR REPLACE PROCEDURE `class.find`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_department varchar(255),
	IN p_shorthand  varchar(255)
)
BEGIN
	DECLARE v_userid uuid DEFAULT NULL;

	SELECT userid INTO v_userid
	  FROM sessions
	 WHERE sessionID = p_sessionID
	   AND BINARY sessionKey = p_sessionKey
	   AND expiration > NOW()
	 LIMIT 1;

	IF v_userid IS NULL THEN
		SIGNAL SQLSTATE '45401' SET MESSAGE_TEXT = 'Not logged in';
	END IF;

	CALL `class.lookup`(p_department, p_shorthand, v_userid);
END //

-- For visitors with no session. The server only calls this when ANONYMOUS_CLIENTS is on.
CREATE OR REPLACE PROCEDURE `class.findAnonymous`(
	IN p_department varchar(255),
	IN p_shorthand  varchar(255)
)
BEGIN
	CALL `class.lookup`(p_department, p_shorthand, NULL);
END //

DELIMITER ;
