import { test, expect } from '@playwright/test';
test('Chrome identity never submits login; customer email requires an app phone/password', async ({ page }) => {
 let logins=0;
 await page.route('**/api/v1/**', route => {
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/auth/login')){logins++;return route.fulfill({status:401,json:{code:'INVALID_CREDENTIALS',detail:'Sign-in details are incorrect or unavailable'}});}
  if(path.endsWith('/auth/session'))return route.fulfill({json:{user:null}});
  if(path.endsWith('/auth/csrf'))return route.fulfill({json:{headerName:'X-CSRF-TOKEN',token:'fixture'}});
  return route.fulfill({json:{signupEnabled:false,passwordMinLength:12,captcha:{mode:'DISABLED'}}});
 });
 await page.goto('/account/login');
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
 expect(logins).toBe(0);
 await page.getByLabel('Mobile number with country code',{exact:true}).fill('person@gmail.com');
 await page.getByLabel('Password',{exact:true}).fill('Invalid-Password-99');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByText('Use your mobile number and VirtualWardrobe password to sign in.',{exact:true})).toBeVisible();
 expect(logins).toBe(0);
 await page.getByLabel('Mobile number with country code',{exact:true}).fill('+919000000001');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByText('Sign-in details are incorrect or unavailable',{exact:true})).toBeVisible();
 expect(logins).toBe(1);
});
