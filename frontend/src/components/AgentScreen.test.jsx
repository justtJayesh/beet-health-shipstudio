import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentScreen } from "./AgentScreen.jsx";

describe("AgentScreen", () => {
  it("renders the Talk to Beet hero with the Aura placeholder", () => {
    render(<AgentScreen agentStatus={null} />);
    expect(screen.getByText("Talk to Beet")).toBeInTheDocument();
    expect(screen.getByText("Aura voice UI renders here")).toBeInTheDocument();
  });

  it("shows the status line when agentStatus is set", () => {
    render(<AgentScreen agentStatus={{ status: "listening", targetMealId: null }} />);
    expect(screen.getByText("Agent: listening…")).toBeInTheDocument();
  });
});
