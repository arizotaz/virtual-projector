import { Router, Request, Response, NextFunction } from "express";
import { GetInfo, getUserBySession } from "../utils";
import { AddClass, AddSection, AddStudent, GetClasses, GetStudents, RemoveClass, RemoveSection, RemoveStudent } from "../teacher_utils";
const router = Router();

/**
 * This is a special permission checker where
 * before continuing with a request in /admin
 * authorization is performed, keeps the code DRY
 * 
 * @param req 
 * @param res 
 * @param next 
 * @returns 
 */
const requireTeacher = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userData = await GetInfo(req.cookies.sid ?? "");
    const role = userData?.role?.toLowerCase() ?? "unknown";

    if (!userData)
        return res.status(401).json({ success: false, message: "Not authenticated" });

    if (role !== "teacher")
        return res.status(403).json({ success: false, message: "Access Denied" });

    next();
};
router.use(requireTeacher);

router.post("/add_student", async (req, res) => {
    try {
        const { email, classId, section } = req.body;
        return res.json(await AddStudent(email, classId, section, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[ADD-STUDENT Err]", e)
        return res.status(500).send("Server Error");
    }
});
router.post("/remove_student", async (req, res) => {
    try {
        const { email, classId, section } = req.body;
        return res.json(await RemoveStudent(email, classId, section, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[REMOVE-STUDENT Err]", e)
        return res.status(500).send("Server Error");
    }
});

router.get("/get_classes", async (req, res) => {
    try {
        const result = {
            "classes": await GetClasses(req.cookies.sid ?? "")
        };
        return res.json(result);
    } catch (e) {
        console.error("[GET-CLASSES Err]", e)
        return res.status(500).send("Server Error");
    }
});
router.post("/get_students", async (req, res) => {
    try {
        const { classId, section } = req.body;
        return res.json(await GetStudents(classId, section, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[GET-STUDENTS Err]", e)
        return res.status(500).send("Server Error");
    }
});

router.post("/add_class", async (req, res) => {
    try {
        const { name, crn, section } = req.body;
        return res.json(await AddClass(name, crn, section, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[ADD-CLASS Err]", e)
        return res.status(500).send("Server Error");
    }
});
router.post("/remove_class", async (req, res) => {
    try {
        const { classId } = req.body;
        return res.json(await RemoveClass(classId, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[REMOVE-CLASS Err]", e)
        return res.status(500).send("Server Error");
    }
});

router.post("/add_section", async (req, res) => {
    try {
        const { classId, section } = req.body;
        return res.json(await AddSection(classId, section, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[ADD-SECTION Err]", e)
        return res.status(500).send("Server Error");
    }
});
router.post("/remove_section", async (req, res) => {
    try {
        const { classId, section } = req.body;
        return res.json(await RemoveSection(classId, section, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[REMOVE-SECTION Err]", e)
        return res.status(500).send("Server Error");
    }
});

export default router;