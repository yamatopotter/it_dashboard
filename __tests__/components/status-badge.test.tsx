import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  it("renders 'Online' text when isOnline is true", () => {
    render(<StatusBadge isOnline={true} />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("renders 'Offline' text when isOnline is false", () => {
    render(<StatusBadge isOnline={false} />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("accepts custom className", () => {
    const { container } = render(<StatusBadge isOnline={true} className="test-class" />);
    expect(container.firstChild).toBeDefined();
  });
});
