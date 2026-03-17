import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { getUsers } from '~/models/user.server';

export const meta: MetaFunction = () => {
  return [{ title: 'Home - My Remix App' }];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const users = await getUsers();
  return json({ users });
}

export default function Index() {
  const { users } = useLoaderData<typeof loader>();

  return (
    <main className="container">
      <h1>Welcome to Remix</h1>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.name} ({user.email})
          </li>
        ))}
      </ul>
    </main>
  );
}
