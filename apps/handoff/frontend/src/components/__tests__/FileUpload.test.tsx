import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FileUpload from '../FileUpload'

describe('FileUpload', () => {
  it('renders upload area', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload onFileSelect={onFileSelect} />)
    
    expect(screen.getByText(/Click to upload/i)).toBeInTheDocument()
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument()
  })

  it('shows file size limit', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload onFileSelect={onFileSelect} />)
    
    expect(screen.getByText(/JSON files up to 50MB/i)).toBeInTheDocument()
  })

  it('calls onFileSelect when valid file is selected', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload onFileSelect={onFileSelect} />)
    
    const file = new File(['{"test": "data"}'], 'test.json', { type: 'application/json' })
    const input = screen.getByLabelText('Upload file')
    
    fireEvent.change(input, { target: { files: [file] } })
    
    expect(onFileSelect).toHaveBeenCalledWith(file)
  })

  it('shows error for non-JSON files', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload onFileSelect={onFileSelect} />)
    
    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const input = screen.getByLabelText('Upload file')
    
    fireEvent.change(input, { target: { files: [file] } })
    
    expect(screen.getByText(/Only JSON files are supported/i)).toBeInTheDocument()
    expect(onFileSelect).not.toHaveBeenCalled()
  })

  it('shows error for files exceeding size limit', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload onFileSelect={onFileSelect} />)
    
    // Create a file larger than 50MB
    const largeContent = 'x'.repeat(51 * 1024 * 1024)
    const file = new File([largeContent], 'large.json', { type: 'application/json' })
    
    Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 })
    
    const input = screen.getByLabelText('Upload file')
    fireEvent.change(input, { target: { files: [file] } })
    
    expect(screen.getByText(/File size exceeds 50MB limit/i)).toBeInTheDocument()
    expect(onFileSelect).not.toHaveBeenCalled()
  })

  it('handles drag and drop', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload onFileSelect={onFileSelect} />)
    
    const file = new File(['{"test": "data"}'], 'test.json', { type: 'application/json' })
    const dropZone = screen.getByText(/Click to upload/i).closest('div')
    
    if (dropZone) {
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file],
        },
      })
      
      expect(onFileSelect).toHaveBeenCalledWith(file)
    }
  })

  it('disables upload when disabled prop is true', () => {
    const onFileSelect = vi.fn()
    render(<FileUpload onFileSelect={onFileSelect} disabled={true} />)
    
    const input = screen.getByLabelText('Upload file')
    expect(input).toBeDisabled()
  })
})
