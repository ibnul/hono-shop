import { Layout } from '../layout.js'

export const AdminLogin = ({ next, error }: { next: string; error?: string }) => (
  <Layout title="Admin login">
    <section class="card account-card">
      <h1>Admin login</h1>
      {error && <p class="account-error" role="alert">{error}</p>}
      <form method="post" action="/admin/login" class="account-form">
        <input type="hidden" name="next" value={next} />
        <label>Username <input name="username" autocomplete="username" required /></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
        <button class="btn" type="submit">Log in</button>
      </form>
    </section>
  </Layout>
)
