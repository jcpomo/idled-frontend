import { test, expect } from '@playwright/test'

test('login, create project, add task, move to done', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('email').fill('ana@idled.test')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  const projectName = `E2E ${Date.now()}`
  await page.getByLabel('nuevo proyecto').fill(projectName)
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click()
  await page.getByText(projectName).click()

  await page.getByLabel('nueva tarea open').fill('Tarea E2E')
  await page.locator('[data-testid="column-open"] button', { hasText: '+' }).click()
  await expect(page.locator('[data-testid="column-open"]')).toContainText('Tarea E2E')

  // drag the card from OPEN to DONE
  const card = page.locator('[data-testid="column-open"]').getByText('Tarea E2E')
  const done = page.locator('[data-testid="column-done"]')
  await card.dragTo(done)
  await expect(done).toContainText('Tarea E2E')
})
