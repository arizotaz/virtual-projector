import { Router, type Request, type Response, type NextFunction } from "express";
import * as msal from "@azure/msal-node";

const TENANT = process.env.AZURE_TENANT_ID!;
const REDIRECT_URI = process.env.AZURE_REDIRECT_URI!;
const SCOPES = ["openid", "profile", "email"];
const secure = process.env.PROD === "production";

const msalClient = new msal.ConfidentialClientApplication({
    auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${TENANT}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
});
const crypto = new msal.CryptoProvider();

const cookieBase = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    signed: true
};

export interface SessionUser {
    oid: string;
    name?: string;
    email?: string;
}

export const auth = Router();

// Redirect the user to Microsoft
auth.get("/login", async (_req, res) => {
    const { verifier, challenge } = await crypto.generatePkceCodes();
    const state = crypto.createNewGuid();

    const url = await msalClient.getAuthCodeUrl({
        scopes: SCOPES,
        redirectUri: REDIRECT_URI,
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        state,
    });

    res.cookie("msal_flow", JSON.stringify({ verifier, state }), {
        ...cookieBase,
        maxAge: 10 * 60 * 1000,
    });
    res.redirect(url);
});

// Microsoft redirects back here with ?code=...&state=...
auth.get("/callback", async (req, res) => {
    const raw = req.signedCookies.msal_flow as string | undefined;
    res.clearCookie("msal_flow", cookieBase);

    const flow = raw ? (JSON.parse(raw) as { verifier: string; state: string }) : null;
    const code = req.query.code;

    if (!flow || typeof code !== "string" || req.query.state !== flow.state) {
        return res.status(400).send("Invalid login state");
    }

    try {
        const result = await msalClient.acquireTokenByCode({
            code,
            scopes: SCOPES,
            redirectUri: REDIRECT_URI,
            codeVerifier: flow.verifier,
        });

        const claims = result.idTokenClaims as Record<string, string | undefined>;
        const user: SessionUser = {
            oid: claims.oid!,
            name: claims.name,
            email: claims.preferred_username,
        };

        res.cookie("session", JSON.stringify(user), {
            ...cookieBase,
            maxAge: 8 * 60 * 60 * 1000,
        });
        res.redirect("/");
    } catch (e) {
        console.error("[AUTH CALLBACK]", e);
        res.status(500).send("Login failed");
    }
});

// get current user information
auth.get("/me", (req, res) => {
    const user = readSession(req);
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    res.json(user);
});

auth.post("/logout", (_req, res) => {
    res.clearCookie("session", cookieBase);
    res.json({ ok: true });
});

function readSession(req: Request): SessionUser | null {
    const raw = req.signedCookies.session as string | undefined;
    if (!raw) return null;
    try {
        return JSON.parse(raw) as SessionUser;
    } catch {
        return null;
    }
}

// protect any route with this
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const user = readSession(req);
    if (!user) return res.status(401).json({ error: "unauthenticated" });
    res.locals.user = user;
    next();
}