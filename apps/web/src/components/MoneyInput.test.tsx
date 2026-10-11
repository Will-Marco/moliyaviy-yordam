import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoneyInput } from './MoneyInput'

const nb = ' '

describe('MoneyInput (FR-10.1)', () => {
  it('groups thousands while typing and passes the formatted value on', async () => {
    const onChange = vi.fn()
    render(<MoneyInput aria-label="Summa" onChange={onChange} />)
    const input = screen.getByLabelText('Summa')
    await userEvent.type(input, '2000000')
    expect(input).toHaveValue(`2${nb}000${nb}000`)
    expect(onChange.mock.lastCall?.[0].target.value).toBe(`2${nb}000${nb}000`)
  })

  it('accepts a decimal comma or dot with up to two decimals', async () => {
    render(<MoneyInput aria-label="Summa" />)
    const input = screen.getByLabelText('Summa')
    await userEvent.type(input, '1234.56')
    expect(input).toHaveValue(`1${nb}234,56`)
  })

  it('keeps the caret in place when a digit is inserted in the middle', async () => {
    render(<MoneyInput aria-label="Summa" />)
    const input = screen.getByLabelText<HTMLInputElement>('Summa')
    await userEvent.type(input, '100000')
    await userEvent.type(input, '5', { initialSelectionStart: 1, initialSelectionEnd: 1 })
    expect(input).toHaveValue(`1${nb}500${nb}000`)
    expect(input.selectionStart).toBe(3)
  })

  it('steps over a thousands space with Delete and Backspace', async () => {
    render(<MoneyInput aria-label="Summa" />)
    const input = screen.getByLabelText<HTMLInputElement>('Summa')
    await userEvent.type(input, '1234')
    await userEvent.type(input, '{Delete}', { initialSelectionStart: 1, initialSelectionEnd: 1 })
    expect(input).toHaveValue('134')
    await userEvent.clear(input)
    await userEvent.type(input, '1234')
    await userEvent.type(input, '{Backspace}', { initialSelectionStart: 2, initialSelectionEnd: 2 })
    expect(input).toHaveValue('234')
  })

  it('formats a pasted amount', async () => {
    render(<MoneyInput aria-label="Summa" />)
    const input = screen.getByLabelText('Summa')
    await userEvent.click(input)
    await userEvent.paste('2 500 000,00 so‘m')
    expect(input).toHaveValue(`2${nb}500${nb}000,00`)
  })
})
