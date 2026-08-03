function required(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.`);
  }
  return value;
}

export const config = {
  region: required('VITE_AWS_REGION'),
  userPoolId: required('VITE_USER_POOL_ID'),
  userPoolClientId: required('VITE_USER_POOL_CLIENT_ID'),
  apiUrl: required('VITE_API_URL').replace(/\/$/, ''),
};
