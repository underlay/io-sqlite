export const uriPattern = /^[a-z0-9]+:(?:\/[A-Za-z0-9-._:]*)*[A-Za-z0-9-._:]+(?:\/|#)[A-Za-z0-9-._]+$/

export function validateURI(uri: string) {
	if (uriPattern.test(uri) === false) {
		throw new Error(`Invalid uri ${uri}`)
	}
}
