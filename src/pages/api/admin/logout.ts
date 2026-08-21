import type { APIRoute } from 'astro';
import { COOKIE_NAME } from '../../../middleware';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(COOKIE_NAME, { path: '/' });
  return redirect('/admin/login/', 303);
};
