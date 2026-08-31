import { redirect } from "next/navigation";

/**
 * No marketing page. Root goes straight into the product.
 *
 * If there's no token the API returns 401 and the client bounces to /sign-in,
 * so this single redirect covers both signed-in and signed-out.
 */
export default function Home() {
  redirect("/yard");
}
