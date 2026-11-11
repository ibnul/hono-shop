export const WishlistButton = ({ productId, saved, returnTo }: {
  productId: string
  saved: boolean
  returnTo: 'shop' | 'wishlist'
}) => {
  const title = saved ? 'Remove from wishlist' : 'Save to wishlist'
  return (
    <form method="post" action={`/account/wishlist/${encodeURIComponent(productId)}`} data-wishlist class="wishlist-form">
      <input type="hidden" name="action" value={saved ? 'remove' : 'save'} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" class="wishlist-heart" title={title} aria-label={title} aria-pressed={saved ? 'true' : 'false'}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      </button>
    </form>
  )
}
