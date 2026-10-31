import { ErrorCode } from '@/enums/error-code';
import { HttpStatus } from '@/enums/api';
import { ERROR_MESSAGES, ServiceError } from '@/errors';
import type { PdfOptions } from '@/types/pdf';

const PAGE_FORMATS = new Set(['A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid']);
const MARGIN_KEYS = new Set(['top', 'right', 'bottom', 'left']);
const PDF_OPTION_KEYS = new Set([
  'format',
  'landscape',
  'margin',
  'displayHeaderFooter',
  'headerTemplate',
  'footerTemplate',
]);

const MAX_TEMPLATE_LENGTH = 32_768;
const MAX_MARGIN_VALUE = 1000;
const MARGIN_VALUE_PATTERN = /^\d+(?:\.\d+)?(?:mm|cm|in|px)$/;

function invalidOptions(): ServiceError {
  return new ServiceError(
    ErrorCode.InvalidOptions,
    ERROR_MESSAGES.invalidOptions,
    HttpStatus.BadRequest,
  );
}

export function validatePdfOptions(input: unknown = undefined): PdfOptions {
  if (input === undefined) {
    return {};
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidOptions();
  }

  const options = input as Record<string, unknown>;

  if (Object.keys(options).some((key) => !PDF_OPTION_KEYS.has(key))) {
    throw invalidOptions();
  }

  if (
    options.format !== undefined &&
    !PAGE_FORMATS.has(options.format as string)
  ) {
    throw invalidOptions();
  }

  if (
    options.landscape !== undefined &&
    typeof options.landscape !== 'boolean'
  ) {
    throw invalidOptions();
  }

  if (
    options.displayHeaderFooter !== undefined &&
    typeof options.displayHeaderFooter !== 'boolean'
  ) {
    throw invalidOptions();
  }

  if (options.margin !== undefined) {
    if (
      !options.margin ||
      typeof options.margin !== 'object' ||
      Array.isArray(options.margin)
    ) {
      throw invalidOptions();
    }

    for (const [side, value] of Object.entries(options.margin)) {
      if (
        !MARGIN_KEYS.has(side) ||
        typeof value !== 'string' ||
        !MARGIN_VALUE_PATTERN.test(value) ||
        Number.parseFloat(value) > MAX_MARGIN_VALUE
      ) {
        throw invalidOptions();
      }
    }
  }

  for (const key of ['headerTemplate', 'footerTemplate']) {
    const value = options[key];

    if (
      value !== undefined &&
      (typeof value !== 'string' || value.length > MAX_TEMPLATE_LENGTH)
    ) {
      throw invalidOptions();
    }
  }

  if (
    (options.headerTemplate !== undefined ||
      options.footerTemplate !== undefined) &&
    options.displayHeaderFooter !== true
  ) {
    throw invalidOptions();
  }

  return options as PdfOptions;
}
