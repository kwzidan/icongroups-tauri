import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App Component", () => {
  it("renders the initial default icons", () => {
    render(<App />);
    
    // Check if Browser, Files, and Terminal are rendered
    // Using name since they are in the span under the button
    expect(screen.getByText("Browser")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("shows settings button", () => {
    render(<App />);
    const settingsButton = screen.getByText(/الإعدادات/i);
    expect(settingsButton).toBeInTheDocument();
  });
});
