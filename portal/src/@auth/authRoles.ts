/**
 * The authRoles object defines the authorization roles for the School Dashboard.
 * Roles map to the authentication-spec.md hierarchy.
 */
const authRoles = {
	/**
	 * Super Admin — unrestricted access to every feature.
	 */
	superAdmin: ['SUPER_ADMIN'],

	/**
	 * Admin — day-to-day operational access.
	 */
	admin: ['SUPER_ADMIN', 'ADMIN'],

	/**
	 * Teacher — classroom and gradebook access.
	 */
	teacher: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'],

	/**
	 * Finance — fee management and reporting.
	 */
	finance: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'],

	/**
	 * Student — personal academic access.
	 */
	student: ['SUPER_ADMIN', 'ADMIN', 'STUDENT'],

	/**
	 * Parent — child-scoped view access.
	 */
	parent: ['SUPER_ADMIN', 'ADMIN', 'PARENT'],

	/**
	 * All staff roles (no students/parents).
	 */
	allStaff: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'FINANCE'],

	/**
	 * Any authenticated user.
	 */
	allAuthenticated: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'FINANCE', 'STUDENT', 'PARENT'],

	/**
	 * Unauthenticated guests only (login pages).
	 */
	onlyGuest: []
};

export default authRoles;
