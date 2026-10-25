import { useState } from "react";

type StreamTarget = "window" | "application";

export default function StreamPanel() {
    const [streamTarget, setStreamTarget] =
        useState<StreamTarget>("window");

    const [selectedApplication, setSelectedApplication] =
        useState("");

    const [streaming, setStreaming] = useState(false);

    return (
        <>
        {/* Stream preview */}
        <div className="col-12 col-xl-8">
            <div className="card shadow-sm">
                <div className="card-header d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Stream Preview</h5>

                    {streaming && (
                        <span className="badge text-bg-success">
                            LIVE
                        </span>
                    )}
                </div>

                <div className="card-body">
                    <div
                        className="bg-dark rounded d-flex align-items-center justify-content-center"
                        style={{
                            minHeight: 400,
                        }}
                    >
                        <div className="text-center text-white">
                            <div
                                className="mb-3"
                                style={{ fontSize: 48 }}
                            >
                                ▶
                            </div>

                            <h5>
                                {streaming
                                    ? "Stream is live"
                                    : "Stream preview"}
                            </h5>

                            <p className="text-white-50 mb-0">
                                {streamTarget === "window"
                                    ? "Entire window"
                                    : selectedApplication ||
                                        "No application selected"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Stream controls */}
        <div className="col-12 col-xl-4">
            <div className="card shadow-sm">
                <div className="card-header">
                    <h5 className="mb-0">Stream Controls</h5>
                </div>

                <div>
                    {streaming ? (
                        <button
                            type="button"
                            className="btn btn-danger w-100"
                            onClick={() => setStreaming(false)}
                        >
                            Stop Stream
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-success w-100"
                            onClick={() => setStreaming(true)}
                        >
                            Start Stream
                        </button>
                    )}
                </div>

                <div className="card-body">
                    <label className="form-label">
                        Stream Target
                    </label>

                    <div className="btn-group w-100 mb-3">
                        <button
                            type="button"
                            className={`btn ${
                                streamTarget === "window"
                                    ? "btn-primary"
                                    : "btn-outline-primary"
                            }`}
                            onClick={() =>
                                setStreamTarget("window")
                            }
                        >
                            Entire Window
                        </button>

                        <button
                            type="button"
                            className={`btn ${
                                streamTarget === "application"
                                    ? "btn-primary"
                                    : "btn-outline-primary"
                            }`}
                            onClick={() =>
                                setStreamTarget("application")
                            }
                        >
                            Application
                        </button>
                    </div>

                    {streamTarget === "application" && (
                        <div className="mb-3">
                            <label
                                htmlFor="application"
                                className="form-label"
                            >
                                Application Window
                            </label>

                            <select
                                id="application"
                                className="form-select"
                                value={selectedApplication}
                                onChange={(event) =>
                                    setSelectedApplication(
                                        event.target.value
                                    )
                                }
                            >
                                <option value="">
                                    Select an application...
                                </option>

                                <option value="Google Chrome">
                                    Google Chrome
                                </option>

                                <option value="Visual Studio Code">
                                    Visual Studio Code
                                </option>

                                <option value="Microsoft Word">
                                    Microsoft Word
                                </option>
                            </select>
                        </div>
                    )}

                    <div className="alert alert-info mb-0">
                        <strong>Target:</strong>{" "}
                        {streamTarget === "window"
                            ? "Entire window"
                            : selectedApplication ||
                                "No application selected"}
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}