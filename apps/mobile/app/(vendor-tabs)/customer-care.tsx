import { Redirect } from 'expo-router';
export default function CustomerCareRedirect() {
  return <Redirect href={"/vendor-customer-care" as any} />;
}
