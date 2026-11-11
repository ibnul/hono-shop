import { CustomerLayout } from './layout.js'

export const AccountHome = ({ user }: { user: { name: string; email: string } }) => (
  <CustomerLayout title="My account" tab="home">
    <section class="card">
      <h1>My account</h1>
      <p>Signed in as <strong>{user.name}</strong></p>
      <p>{user.email}</p>
    </section>
  </CustomerLayout>
)
