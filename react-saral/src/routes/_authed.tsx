import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Layout } from "@/components/layout"

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}
