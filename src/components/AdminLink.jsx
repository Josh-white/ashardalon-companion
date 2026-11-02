// The way back to #admin from each hidden page.
export function AdminLink({ className = '' }) {
  return (
    <a href="/#admin" className={`text-sm text-amber-300 underline ${className}`}>
      ← Admin
    </a>
  )
}
