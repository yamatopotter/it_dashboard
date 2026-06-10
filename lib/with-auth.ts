import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

type RouteHandler<A extends unknown[]> = (...args: A) => Promise<NextResponse | Response>;

export function withAuth<A extends unknown[]>(handler: RouteHandler<A>): RouteHandler<A> {
  return async (...args: A) => {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return handler(...args);
  };
}
