import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantResponse } from '@shared/types';
import { CommandInput } from '@renderer/components/input/CommandInput';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { installArcMock } from './arcMock';

beforeEach(() => {
  const arc = installArcMock();
  arc.assistant.send = vi.fn(() => new Promise<AssistantResponse>(() => undefined));
  useConversationStore.setState({
    messages: [],
    inputHistory: ['open vscode', 'search for flights'],
    activeResponseId: null,
  });
});

const input = () => screen.getByRole('textbox') as HTMLInputElement;

describe('CommandInput', () => {
  it('uses the configured assistant name in the placeholder', () => {
    render(<CommandInput assistantName="JEEVES" />);
    expect(input().placeholder).toBe('Ask JEEVES anything…');
  });

  it('sends on Enter and clears', () => {
    render(<CommandInput assistantName="ARC" />);
    fireEvent.change(input(), { target: { value: 'tell me a joke' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(window.arc.assistant.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'tell me a joke' }),
    );
    expect(input().value).toBe('');
  });

  it('cycles history with ↑/↓ and restores the draft', () => {
    render(<CommandInput assistantName="ARC" />);
    fireEvent.change(input(), { target: { value: 'draft' } });
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(input().value).toBe('search for flights');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(input().value).toBe('open vscode');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().value).toBe('draft');
  });

  it('Esc clears the input', () => {
    render(<CommandInput assistantName="ARC" />);
    fireEvent.change(input(), { target: { value: 'oops' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('');
  });

  it('"/" opens the palette, filters, and Enter runs the command locally', () => {
    render(<CommandInput assistantName="ARC" />);
    fireEvent.change(input(), { target: { value: '/' } });
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(4);
    fireEvent.change(input(), { target: { value: '/cl' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('/clear'),
    ]);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(window.arc.assistant.reset).toHaveBeenCalled();
    expect(window.arc.assistant.send).not.toHaveBeenCalled();
  });
});
