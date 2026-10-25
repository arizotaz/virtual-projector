import { Router, Request, Response, NextFunction } from "express";
import { GetInfo } from "../utils";
import { GetStudentEnrollments } from "../student_utils";
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
const requireStudent = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userData = await GetInfo(req.cookies.sid ?? "");
    const role = userData?.role?.toLowerCase() ?? "unknown";

    if (!userData)
        return res.status(401).json({ success: false, message: "Not authenticated" });

    if (role !== "student")
        return res.status(403).json({ success: false, message: "Access Denied" });

    next();
};
router.use(requireStudent);

router.get("/get_enrollments", async (req, res) => {
    try {
        const result = {
            "enrollments": await GetStudentEnrollments(req.cookies.sid ?? "")
        };

        console.log(result);

        return res.json(result);
    } catch (e) {
        console.error("[GET-ENROLLMENTS Err]", e)
        return res.status(500).send("Server Error");
    }
});

export default router;