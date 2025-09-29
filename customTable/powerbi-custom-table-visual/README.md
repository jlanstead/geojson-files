# Power BI Custom Table Visual

This project is a custom visual for Power BI that mimics the standard table visual, allowing for enhanced header formatting options similar to those found in Excel. Users can customize header alignment and rotation, providing a more flexible and visually appealing way to present tabular data.

## Project Structure

The project consists of the following files and directories:

- **assets/icon.svg**: The icon for the custom visual displayed in Power BI.
- **src/visual.ts**: The main entry point for the visual, responsible for initializing the visual, handling data updates, and managing rendering.
- **src/settings.ts**: Defines user-configurable settings for header formatting, alignment, and rotation.
- **src/tableVisual.ts**: Contains the logic for creating and managing the table structure, including rendering rows and cells based on data and settings.
- **src/styles/tableVisual.less**: Styles for the table visual, including header styles, alignment, and rotation effects.
- **pbiviz.json**: Configuration file for the Power BI custom visual, containing metadata such as name, version, and capabilities.
- **package.json**: npm configuration file listing dependencies and scripts for building and packaging the visual.
- **tsconfig.json**: TypeScript configuration file specifying compiler options and included files.
- **.vscode/launch.json**: Debugging configuration for the visual in a development environment.
- **.gitignore**: Specifies files and directories to be ignored by Git.

## Installation

To install the project, clone the repository and run the following command to install the necessary dependencies:

```
npm install
```

## Usage

To start the development server and view the visual in Power BI, run:

```
pbiviz start
```

## Development

For development, you can modify the source files located in the `src` directory. The visual can be packaged for deployment using:

```
pbiviz package
```

## Contributing

Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.