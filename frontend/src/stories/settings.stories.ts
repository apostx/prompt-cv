import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { SettingsComponent } from '../app/components/dashboard/settings.component';
import { UserApiService } from '../app/services/user-api.service';
import { GooglePickerService } from '../app/services/google-picker.service';
import { of, delay } from 'rxjs';

const mockSettings = {
  folderPath: '.prompt-cv/generated',
  contextDocId: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
  instructionsDocId: '1xYzAbCdEfGhIjKlMnOpQrStUv',
  templateDocId: '1pQrStUvWxYzAbCdEfGhIjKlMn',
};

const mockValidation = {
  contextDocId: { valid: true, title: 'My CV Context', path: '.prompt-cv/' },
  instructionsDocId: { valid: true, title: 'My CV Instructions', path: '.prompt-cv/' },
  templateDocId: { valid: true, title: 'My CV Template', path: '.prompt-cv/' },
};

const mockUserApi = {
  getSettings: () => of({ settings: mockSettings }),
  validateDoc: (id: string) => of({ valid: true, title: 'Document Title', path: '.prompt-cv/' }).pipe(delay(500)),
  updateSettings: (settings: unknown) => of({ validation: mockValidation }).pipe(delay(300)),
};

const mockPicker = {
  pickDocument: () => of(null),
  pickFolder: () => of(null),
};

const meta: Meta<SettingsComponent> = {
  title: 'Dashboard/Settings',
  component: SettingsComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: mockUserApi },
        { provide: GooglePickerService, useValue: mockPicker },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<SettingsComponent>;

export const AllFieldsValid: Story = {};

export const Empty: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { ...mockUserApi, getSettings: () => of({ settings: {} }) } },
      ],
    }),
  ],
};

export const WithErrors: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: UserApiService,
          useValue: {
            ...mockUserApi,
            getSettings: () => of({
              settings: {
                folderPath: '.prompt-cv/generated',
                contextDocId: 'invalid-short',
                instructionsDocId: '1xYzAbCdEfGhIjKlMnOpQrStUv',
                templateDocId: '1pQrStUvWxYzAbCdEfGhIjKlMn',
              },
            }),
            validateDoc: () => of({ valid: false, error: 'Document not found or access denied' }).pipe(delay(500)),
          },
        },
      ],
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: UserApiService, useValue: { ...mockUserApi, getSettings: () => of({ settings: {} }).pipe(delay(999999)) } },
      ],
    }),
  ],
};
