import { Layout } from './layout.js'

export const AccountForm = ({ registering, error }: { registering: boolean; error?: string }) => (
  <Layout title={registering ? 'Create account' : 'Sign in'} accountNav="guest">
    <section class="card account-card">
      <h1>{registering ? 'Create account' : 'Sign in'}</h1>
      {error && <p class="account-error" role="alert">{error}</p>}
      <form method="post" action={registering ? '/account/register' : '/account/sign-in'} class="account-form">
        {registering && (
          <label>Name <input name="name" autocomplete="name" maxlength={100} required /></label>
        )}
        <label>Email <input type="email" name="email" autocomplete="username" maxlength={191} required /></label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autocomplete={registering ? 'new-password' : 'current-password'}
            minlength={registering ? 12 : undefined}
            maxlength={128}
            aria-describedby={registering ? 'password-hint' : undefined}
            required
          />
        </label>
        {registering && <small id="password-hint">Use at least 12 characters.</small>}
        <button type="submit" class="btn">{registering ? 'Create account' : 'Sign in'}</button>
      </form>
      <p>{registering ? <a href="/account/sign-in">Already have an account? Sign in</a> : <a href="/account/register">Create an account</a>}</p>
    </section>
  </Layout>
)
