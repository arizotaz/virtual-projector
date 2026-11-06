-- Class addresses: /c/{department}/{shorthand}. Safe to re-run. Apply after auth.sql and before admin.sql:
--   mariadb --default-character-set=utf8mb4 -h <host> -u <user> -p <database> < server/db/classes.sql
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

-- The section at /c/{department}/{shorthand}, for any logged in user
CREATE OR REPLACE PROCEDURE `class.find`(
	IN p_sessionID  varchar(256),
	IN p_sessionKey varchar(512),
	IN p_department varchar(255),
	IN p_shorthand  varchar(255)
)
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM sessions
		 WHERE sessionID = p_sessionID
		   AND BINARY sessionKey = p_sessionKey
		   AND expiration > NOW()
	) THEN
		SIGNAL SQLSTATE '45401' SET MESSAGE_TEXT = 'Not logged in';
	END IF;

	IF NOT EXISTS (SELECT 1 FROM sections WHERE department = p_department AND shorthand = p_shorthand) THEN
		SIGNAL SQLSTATE '45404' SET MESSAGE_TEXT = 'Class not found';
	END IF;

	SELECT s.crn, c.name AS class_name, s.sectionid, s.department, s.shorthand,
		CONCAT_WS(' ', t.first_name, t.middle_initial, t.last_name) AS lecturer_name
	  FROM sections s
	  JOIN classes c ON c.crn = s.crn
	  JOIN users t ON t.id = s.lecturer
	 WHERE s.department = p_department
	   AND s.shorthand = p_shorthand;
END //

DELIMITER ;
