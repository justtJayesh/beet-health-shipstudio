import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLine } from "./StatusLine.jsx";

describe("StatusLine", () => {
  it("renders nothing when agentStatus is null", () => {
    const { container } = render(<StatusLine agentStatus={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["listening", "Agent: listening…"],
    ["thinking", "Agent: thinking…"],
    ["speaking", "Agent: speaking…"],
    ["awaiting_confirmation", "Agent: awaiting confirmation…"],
  ])("renders the text for status %s", (status, expected) => {
    render(<StatusLine agentStatus={{ status, targetMealId: null }} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
