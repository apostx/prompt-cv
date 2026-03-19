import { describe, it, expect } from 'vitest';
import { cleanHandlebarsHtml, autoLinkText, extractParagraphIndents, toSnakeCase } from './cv-generation.js';

describe('cleanHandlebarsHtml', () => {
  it('strips HTML tags from inside {{...}} expressions', () => {
    const input = '{{<span style="color:red">header</span>.<span>name</span>}}';
    expect(cleanHandlebarsHtml(input)).toBe('{{header.name}}');
  });

  it('strips nested span tags from block helpers', () => {
    const input = '{{#<span>each</span> <span>skills</span>}}content{{/<span>each</span>}}';
    expect(cleanHandlebarsHtml(input)).toBe('{{#each skills}}content{{/each}}');
  });

  it('removes <p> wrappers around standalone block helpers', () => {
    const input = '<p>{{#each items}}</p><li>{{name}}</li><p>{{/each}}</p>';
    expect(cleanHandlebarsHtml(input)).toBe('{{#each items}}<li>{{name}}</li>{{/each}}');
  });

  it('removes <p> with span wrappers around block helpers', () => {
    const input = '<p><span style="font-size:12pt">{{#if show}}</span></p>';
    expect(cleanHandlebarsHtml(input)).toBe('{{#if show}}');
  });

  it('preserves <p> tags around non-block-helper content', () => {
    const input = '<p>Hello {{name}}</p>';
    expect(cleanHandlebarsHtml(input)).toBe('<p>Hello {{name}}</p>');
  });

  it('handles HTML with no Handlebars expressions', () => {
    const input = '<p>Plain text</p>';
    expect(cleanHandlebarsHtml(input)).toBe('<p>Plain text</p>');
  });
});

describe('autoLinkText', () => {
  it('converts email to mailto link', () => {
    const input = 'Contact john@example.com for info';
    expect(autoLinkText(input)).toBe('Contact <a href="mailto:john@example.com">john@example.com</a> for info');
  });

  it('converts https URL to link', () => {
    const input = 'Visit https://example.com/path';
    expect(autoLinkText(input)).toBe('Visit <a href="https://example.com/path">https://example.com/path</a>');
  });

  it('converts www URL to link with https prefix', () => {
    const input = 'Visit www.example.com';
    expect(autoLinkText(input)).toBe('Visit <a href="https://www.example.com">www.example.com</a>');
  });

  it('skips emails already inside <a> tags', () => {
    const input = '<a href="mailto:john@example.com">john@example.com</a>';
    expect(autoLinkText(input)).toBe(input);
  });

  it('skips URLs already inside <a> tags', () => {
    const input = '<a href="https://example.com">https://example.com</a>';
    expect(autoLinkText(input)).toBe(input);
  });

  it('handles text with no linkable content', () => {
    const input = '<p>Just some text</p>';
    expect(autoLinkText(input)).toBe(input);
  });

  it('links bare domain with common TLD', () => {
    const input = 'Check example.com for details';
    expect(autoLinkText(input)).toContain('href="https://example.com"');
  });
});

describe('extractParagraphIndents', () => {
  it('extracts margin-left from <p> style', () => {
    const html = '<p style="margin-left:36pt">Text</p>';
    const indents = extractParagraphIndents(html);
    expect(indents).toEqual([{ indentStart: 36, indentFirstLine: undefined }]);
  });

  it('extracts margin-left + text-indent combined', () => {
    const html = '<p style="margin-left:36pt;text-indent:-18pt">Text</p>';
    const indents = extractParagraphIndents(html);
    expect(indents).toEqual([{ indentStart: 36, indentFirstLine: 18 }]);
  });

  it('returns 0 for <p> tags with no indent styles', () => {
    const html = '<p>No indent</p>';
    const indents = extractParagraphIndents(html);
    expect(indents).toEqual([{ indentStart: 0, indentFirstLine: undefined }]);
  });

  it('handles multiple <p> tags', () => {
    const html = '<p style="margin-left:18pt">A</p><p style="margin-left:36pt">B</p>';
    const indents = extractParagraphIndents(html);
    expect(indents).toHaveLength(2);
    expect(indents[0].indentStart).toBe(18);
    expect(indents[1].indentStart).toBe(36);
  });

  it('returns empty array for no <p> tags', () => {
    expect(extractParagraphIndents('<div>No p tags</div>')).toEqual([]);
  });
});

describe('toSnakeCase', () => {
  it('converts basic string', () => {
    expect(toSnakeCase('John Doe')).toBe('john_doe');
  });

  it('strips special characters', () => {
    expect(toSnakeCase("O'Brien")).toBe('obrien');
  });

  it('collapses multiple spaces', () => {
    expect(toSnakeCase('  John   Doe  ')).toBe('john_doe');
  });

  it('returns empty string for empty input', () => {
    expect(toSnakeCase('')).toBe('');
  });

  it('handles mixed case', () => {
    expect(toSnakeCase('Software Engineer Google')).toBe('software_engineer_google');
  });
});
