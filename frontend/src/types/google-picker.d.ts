declare namespace google.picker {
  class PickerBuilder {
    addView(view: DocsView): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setDeveloperKey(key: string): PickerBuilder;
    setAppId(appId: string): PickerBuilder;
    setCallback(callback: (data: ResponseObject) => void): PickerBuilder;
    build(): Picker;
  }

  class DocsView {
    constructor(viewId?: string);
    setMimeTypes(mimeTypes: string): DocsView;
    setIncludeFolders(include: boolean): DocsView;
    setSelectFolderEnabled(enabled: boolean): DocsView;
  }

  interface Picker {
    setVisible(visible: boolean): void;
    dispose(): void;
  }

  interface ResponseObject {
    action: string;
    docs: PickerDocument[];
  }

  interface PickerDocument {
    id: string;
    name: string;
    url: string;
    mimeType: string;
  }

  const Action: {
    PICKED: string;
    CANCEL: string;
  };

  const ViewId: {
    DOCUMENTS: string;
    DOCS: string;
    FOLDERS: string;
  };
}

declare namespace gapi {
  function load(api: string, options: { callback: () => void; onerror: () => void }): void;
}
