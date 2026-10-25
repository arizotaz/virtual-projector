import { useState } from 'react';
import { GetBackendStr } from '../utilities/browser_utils';

import Feedback from '../components/feedback';

export default function UserCreateForm({ userType, uriTarget } : { userType: string, uriTarget: string }) {
    const [success, SetSuccess] = useState(false);
    const [msg, SetMsg] = useState<string|undefined|null>("");

    async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
        try {
            event.preventDefault();

            const form = new FormData(event.currentTarget);
            const data = {
                firstName: form.get("firstName"),
                middleInitial: form.get("middleInitial"),
                lastName: form.get("lastName"),
                email: form.get("email"),
                password: form.get("password"),
            };
            
            console.log(`[!] Create ${userType}:`, data);
    
            const endpoint = GetBackendStr(uriTarget);
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });
    
            const result = await response.json();

            SetSuccess(result.success);
            SetMsg(result.message);
    
            // clear feedback after some time
            setTimeout(() => {
                SetMsg(null);
            }, result.success ? 1000 : 3000);
    
            if (result.success) {
                console.log(`[+] Created ${userType} Successful`)
            } else {
                console.error(`[-] ${userType} Creation Failed!`)
            }
        } catch (e) {
            console.error(`[-] ${userType} Creation Failed:`, e);
        }
    }

    return (
        <>
            <Feedback success={success} message={msg} />
            <form onSubmit={handleSubmit}>
                <div className="row g-3">
                    <div className="col-md-6">
                        <label className="form-label">First Name</label>
                        <input
                            name="firstName"
                            type="text"
                            className="form-control"
                            required
                        />
                    </div>

                    <div className="col-md-2">
                        <label className="form-label">M.I.</label>
                        <input
                            name="middleInitial"
                            type="text"
                            className="form-control"
                            maxLength={1}
                        />
                    </div>

                    <div className="col-md-4">
                        <label className="form-label">Last Name</label>
                        <input
                            name="lastName"
                            type="text"
                            className="form-control"
                            required
                        />
                    </div>

                    <div className="col-12">
                        <label className="form-label">Email</label>
                        <input
                            name="email"
                            type="email"
                            className="form-control"
                            required
                        />
                    </div>

                    <div className="col-12">
                        <label className="form-label">Password</label>
                        <input
                            name="password"
                            type="password"
                            className="form-control"
                            required
                            minLength={8}
                        />
                    </div>

                    <div className="col-12">
                        <button type="submit" className="btn btn-primary">
                            Create {userType.toUpperCase()}
                        </button>
                    </div>
                </div>
            </form>
        </>
    );
}