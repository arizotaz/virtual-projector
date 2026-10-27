import { Router, Request, Response, NextFunction } from "express";
import { GetInfo, CreateUser } from "../utils";
import { DeleteUser, GetUsers } from "../admin_utils";
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
const requireAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userData = await GetInfo(req.cookies.sid ?? "");
    const role = userData?.role?.toLowerCase() ?? "unknown";

    if (!userData)
        return res.status(401).json({ success: false, message: "Not authenticated" });

    if (role !== "administrator" && role !== "super")
        return res.status(403).json({ success: false, message: "Access Denied" });

    next();
};
router.use(requireAdmin);

router.post("/new_admin", async (req, res) => {
    try {
        /**
            0: "Unknown",
            1: "Student",
            2: "Teacher",
            3: "Administrator",
            4: "Super",
        **/

        const {
            firstName,
            middleInitial,
            lastName,
            email,
            password,
        } = req.body;
        return res.json(await CreateUser(firstName, middleInitial, lastName, email, password, 3));
    } catch (e) {
        return res.status(500).send("Server Error");
    }
});
router.post("/new_teacher", async (req, res) => {
    try {
        const {
            firstName,
            middleInitial,
            lastName,
            email,
            password,
        } = req.body;
        return res.json(await CreateUser(firstName, middleInitial, lastName, email, password, 2));
    } catch (e) {
        return res.status(500).send("Server Error");
    }
});
router.post("/new_student", async (req, res) => {
    try {
        /**
            0: "Unknown",
            1: "Student",
            2: "Teacher",
            3: "Administrator",
            4: "Super",
        **/

        const {
            firstName,
            middleInitial,
            lastName,
            email,
            password,
        } = req.body;
        return res.json(await CreateUser(firstName, middleInitial, lastName, email, password, 1));
    } catch (e) {
        return res.status(500).send("Server Error");
    }
});

router.get("/get_users", async (req, res) => {
    try {
        const page  = req.query.page ? Number(req.query.page) : 1;
        
        const result = {
            "users": await GetUsers(page)
        };

        return res.json(result);
    } catch (e) {
        console.error("[GET-USERS Err]", e)
        return res.status(500).send("Server Error");
    }
});

router.post("/delete_user", async (req, res) => {
    try {
        const { uid } = req.body;
        return res.json(await DeleteUser(uid, req.cookies.sid ?? ""));
    } catch (e) {
        console.error("[DELETE-USER Err]", e)
        return res.status(500).send("Server Error");
    }
});

export default router;