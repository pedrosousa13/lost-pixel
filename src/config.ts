import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContextOptions, Page } from 'playwright-core';
import z from 'zod';
import { loadProjectConfigFile, loadTSProjectConfigFile } from './configHelper';
import { log } from './log';
import { ShotModeSchema } from './types';

const MaskSchema = z.object({
  /**
   * CSS selector for the element to mask
   * Examples:
   * - `#my-id`: Selects the element with the id `my-id`
   * - `.my-class`: Selects all elements with the class `my-class`
   * - `div`: Selects all `div` elements
   * - `div.my-class`: Selects all `div` elements with the class `my-class`
   * - `li:nth-child(2n)`: Selects all even `li` elements
   * - `[data-testid="hero-banner"]`: Selects all elements with the attribute `data-testid` set to `hero-banner`
   * - `div > p`: Selects all `p` elements that are direct children of a `div` element
   */
  selector: z.string(),
});

export type Mask = z.infer<typeof MaskSchema>;

const PageScreenshotParameterSchema = z.object({
  /**
   * Path to the page to take a screenshot of (e.g. /login)
   */
  path: z.string(),

  /**
   * Unique name for the page
   */
  name: z.string(),

  /**
   * Time to wait before taking a screenshot
   * @default 1_000
   */
  waitBeforeScreenshot: z.number().default(1000),

  /**
   * Threshold for the difference between the baseline and current image
   *
   * Values between 0 and 1 are interpreted as percentage of the image size
   *
   * Values greater or equal to 1 are interpreted as pixel count.
   * @default 0
   */
  threshold: z.number().default(0),

  /**
   * Define custom breakpoints for the page as width in pixels
   * @default []
   * @example
   * [ 320, 768, 1280 ]
   */
  breakpoints: z.array(z.number()),

  /**
   * Define a custom viewport for the page
   * @default { width: 1280, height: 720 }
   */
  viewport: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),

  /**
   * Define areas for the page where differences will be ignored
   */
  mask: z.array(MaskSchema).optional(),
});

export type PageScreenshotParameter = z.infer<
  typeof PageScreenshotParameterSchema
>;

const StorybookShotsSchema = z.object({
  /**
   * URL of the Storybook instance or local folder
   * @default 'storybook-static'
   */
  storybookUrl: z.string(),

  /**
   * Define areas for all stories where differences will be ignored
   */
  mask: z.array(MaskSchema).optional(),

  /**
   * Define custom breakpoints for all Storybook shots as width in pixels
   * @default []
   * @example
   * [ 320, 768, 1280 ]
   */
  breakpoints: z.array(z.number()).optional(),
});

const LadleShotsSchema = z.object({
  /**
   * URL of the Ladle served instance
   * @default 'http://localhost:61000'
   */
  ladleUrl: z.string(),

  /**
   * Define areas for all stories where differences will be ignored
   */
  mask: z.array(MaskSchema).optional(),

  /**
   * Define custom breakpoints for all Ladle shots as width in pixels
   * @default []
   * @example
   * [ 320, 768, 1280 ]
   */
  breakpoints: z.array(z.number()).default([]).optional(),
});

const HistoireShotsSchema = z.object({
  /**
   * URL of the Histoire served instance
   * @default 'http://localhost:61000'
   */
  histoireUrl: z.string(),

  /**
   * Define areas for all stories where differences will be ignored
   */
  mask: z.array(MaskSchema).optional(),

  /**
   * Define custom breakpoints for all Histoire shots as width in pixels
   * @default []
   * @example
   * [ 320, 768, 1280 ]
   */
  breakpoints: z.array(z.number()).optional(),
});

const PageShotsSchema = z.object({
  /**
   * Paths to take screenshots of
   */
  pages: z.array(PageScreenshotParameterSchema),

  /**
   * Url that must return a JSON compatible with `PageScreenshotParameter[]`. It is useful when you want to autogenerate the pages that you want to run lost-pixel on. Can be used together with `pages` as both are composed into a single run.
   */
  pagesJsonUrl: z.string().optional(),

  /**
   * Base URL of the running application (e.g. http://localhost:3000)
   */
  baseUrl: z.string(),

  /**
   * Define areas for all pages where differences will be ignored
   */
  mask: z.array(MaskSchema).optional(),

  /**
   * Define custom breakpoints for all page shots as width in pixels
   * @default []
   * @example
   * [ 320, 768, 1280 ]
   */
  breakpoints: z.array(z.number()).optional(),
});

const CustomShotsSchema = z.object({
  /**
   * Path to current shots folder
   *
   * This path cannot be the same as the `imagePathCurrent` path
   */
  currentShotsPath: z.string(),
});

const StoryLikeSchema = z.object({
  shotMode: ShotModeSchema,
  id: z.string().optional(),
  kind: z.string().optional(),
  story: z.string().optional(),
  shotName: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

const TimeoutsSchema = z.object({
  /**
   * Timeout for fetching stories
   * @default 30_000
   */
  fetchStories: z.number().default(30_000),

  /**
   * Timeout for loading the state of the page
   * @default 30_000
   */
  loadState: z.number().default(30_000),

  /**
   * Timeout for waiting for network requests to finish
   * @default 30_000
   */
  networkRequests: z.number().default(30_000),
});

const BaseConfigSchema = z.object({
  /**
   * Browser to use: chromium, firefox, or webkit
   * @default 'chromium'
   */
  browser: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),

  /**
   * Enable Storybook mode
   */
  storybookShots: StorybookShotsSchema.optional(),

  /**
   * Enable Ladle mode
   */
  ladleShots: LadleShotsSchema.optional(),

  /**
   * Enable Histoire mode
   */
  histoireShots: HistoireShotsSchema.optional(),

  /**
   * Enable Page mode
   */
  pageShots: PageShotsSchema.optional(),

  /**
   * Enable Custom mode
   */
  customShots: CustomShotsSchema.optional(),

  /**
   * Path to the current image folder
   * @default '.lostpixel/current/'
   */
  imagePathCurrent: z.string().default('.lostpixel/current/'),

  /**
   * Define custom breakpoints for all tests as width in pixels
   * @default []
   * @example
   * [ 320, 768, 1280 ]
   */
  breakpoints: z.array(z.number()).default([]),

  /**
   * Number of concurrent shots to take
   * @default 5
   */
  shotConcurrency: z.number().default(5),

  /**
   * Timeouts for various stages of the test
   */
  timeouts: TimeoutsSchema.default({
    fetchStories: 30_000,
    loadState: 30_000,
    networkRequests: 30_000,
  }),

  /**
   * Time to wait before taking a screenshot
   * @default 1_000
   */
  waitBeforeScreenshot: z.number().default(1000),

  /**
   * Time to wait for the first network request to start
   * @default 1_000
   */
  waitForFirstRequest: z.number().default(1000),

  /**
   * Time to wait for the last network request to start
   * @default 1_000
   */
  waitForLastRequest: z.number().default(1000),

  /**
   * Threshold for the difference between the baseline and current image
   *
   * Values between 0 and 1 are interpreted as percentage of the image size
   *
   * Values greater or equal to 1 are interpreted as pixel count.
   * @default 0
   */
  threshold: z.number().default(0),

  /**
   * How often to retry a shot for a stable result
   * @default 0
   */
  flakynessRetries: z.number().default(0),

  /**
   * Time to wait between flakyness retries
   * @default 2_000
   */
  waitBetweenFlakynessRetries: z.number().default(2000),

  /**
   * Global shot filter
   */
  filterShot: z
    .function()
    .args(StoryLikeSchema)
    .returns(z.boolean())
    .optional(),

  /**
   * Shot and file name generator for images
   */
  shotNameGenerator: z
    .function()
    .args(StoryLikeSchema)
    .returns(z.string())
    .optional(),

  /**
   * Configure browser context options
   */
  configureBrowser: z
    .function()
    .args(StoryLikeSchema)
    .returns(z.custom<BrowserContextOptions>())
    .optional(),

  /**
   * Configure page before screenshot
   */
  beforeScreenshot: z
    .function()
    .args(z.custom<Page>(), StoryLikeSchema)
    .returns(z.promise(z.void()))
    .optional(),
});

export const PlatformModeConfigSchema = BaseConfigSchema.extend({
  /**
   * URL of the Lost Pixel API endpoint
   * @default 'https://api.lost-pixel.com'
   */
  lostPixelPlatform: z.string().default('https://api.lost-pixel.com'),

  /**
   * API key for the Lost Pixel platform
   */
  apiKey: z.string(),

  /**
   * Project ID
   */
  lostPixelProjectId: z.string(),

  /**
   * CI build ID
   */
  // @ts-expect-error If not set, it will be caught during config validation
  ciBuildId: z.string().default(process.env.CI_BUILD_ID),

  /**
   * CI build number
   */
  // @ts-expect-error If not set, it will be caught during config validation
  ciBuildNumber: z.string().default(process.env.CI_BUILD_NUMBER),

  /**
   * Git repository name (e.g. 'lost-pixel/lost-pixel-storybook')
   */
  // @ts-expect-error If not set, it will be caught during config validation
  repository: z.string().default(process.env.REPOSITORY),

  /**
   * Git branch name (e.g. 'main')
   */
  // @ts-expect-error If not set, it will be caught during config validation
  commitRefName: z.string().default(process.env.COMMIT_REF_NAME),

  /**
   * Git commit SHA (e.g. 'b9b8b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9')
   */
  // @ts-expect-error If not set, it will be caught during config validation
  commitHash: z.string().default(process.env.COMMIT_HASH),

  /**
   * File path to event.json file
   */
  eventFilePath: z.string().optional(),

  /**
   * Whether to set the GitHub status check on process start or not
   *
   * Setting this option to `true` makes only sense if the repository settings have pending status checks disabled
   * @default false
   */
  setPendingStatusCheck: z.boolean().default(false),
});

export const GenerateOnlyModeConfigSchema = BaseConfigSchema.extend({
  /**
   * Run in local mode
   * @deprecated Defaults to running in generateOnly mode
   */
  generateOnly: z.boolean().optional(),

  /**
   * Flag that decides if process should exit if a difference is found
   */
  failOnDifference: z.boolean().optional(),

  /**
   * Path to the baseline image folder
   * @default '.lostpixel/baseline/'
   */
  imagePathBaseline: z.string().default('.lostpixel/baseline/'),

  /**
   * Path to the difference image folder
   * @default '.lostpixel/difference/'
   */
  imagePathDifference: z.string().default('.lostpixel/difference/'),

  /**
   * Number of concurrent screenshots to compare
   * @default 10
   */
  compareConcurrency: z.number().default(10),

  /**
   * Which comparison engine to use for diffing images
   * @default 'pixelmatch'
   */
  compareEngine: z.enum(['pixelmatch', 'odiff']).default('pixelmatch'),
});

export const ConfigSchema = z.union([
  PlatformModeConfigSchema,
  GenerateOnlyModeConfigSchema,
]);

// use partial() specifically for the inferred type
export const FlexibleConfigSchema = z.union([
  PlatformModeConfigSchema.extend({
    timeouts: TimeoutsSchema.partial(),
  }).partial(),
  GenerateOnlyModeConfigSchema.extend({
    timeouts: TimeoutsSchema.partial(),
  }).partial(),
]);

type PlatformModeConfig = z.infer<typeof PlatformModeConfigSchema>;
type GenerateOnlyModeConfig = z.infer<typeof GenerateOnlyModeConfigSchema>;

export type Config = z.infer<typeof ConfigSchema>;
export type CustomProjectConfig = z.infer<typeof FlexibleConfigSchema>;

export const MEDIA_UPLOAD_CONCURRENCY = 10;

export let config: Config;

export const isPlatformModeConfig = (
  userConfig: PlatformModeConfig | GenerateOnlyModeConfig,
): userConfig is PlatformModeConfig =>
  'apiKey' in userConfig || 'lostPixelProjectId' in userConfig;

const printConfigErrors = (error: z.ZodError) => {
  for (const issue of error.issues) {
    log.process(
      'error',
      'config',
      [
        'Configuration error:',
        `  - Path: ${issue.path.join('.')}`,
        `  - Message: ${issue.message}`,
      ].join('\n'),
    );
  }
};

export const parseConfig = (userConfig: Config) => {
  if (isPlatformModeConfig(userConfig)) {
    const platformCheck = PlatformModeConfigSchema.safeParse(userConfig);

    if (platformCheck.success) {
      return platformCheck.data;
    }

    printConfigErrors(platformCheck.error);
  } else {
    const generateOnlyCheck =
      GenerateOnlyModeConfigSchema.safeParse(userConfig);

    if (generateOnlyCheck.success) {
      return generateOnlyCheck.data;
    }

    printConfigErrors(generateOnlyCheck.error);
  }

  process.exit(1);
};

const configDirBase = process.env.LOST_PIXEL_CONFIG_DIR ?? process.cwd();

const configFileNameBase = path.join(
  path.isAbsolute(configDirBase) ? '' : process.cwd(),
  configDirBase,
  'lostpixel.config',
);

const loadProjectConfig = async (): Promise<Config> => {
  log.process('info', 'config', 'Loading project config ...');
  log.process('info', 'config', 'Current working directory:', process.cwd());

  if (process.env.LOST_PIXEL_CONFIG_DIR) {
    log.process(
      'info',
      'config',
      'Defined config directory:',
      process.env.LOST_PIXEL_CONFIG_DIR,
    );
  }

  const configExtensions = ['ts', 'js', 'cjs', 'mjs'];
  const configExtensionsString = configExtensions.join('|');

  log.process(
    'info',
    'config',
    'Looking for config file:',
    `${configFileNameBase}.(${configExtensionsString})`,
  );

  const configFiles = configExtensions
    .map((ext) => `${configFileNameBase}.${ext}`)
    .filter((file) => existsSync(file));

  if (configFiles.length === 0) {
    log.process(
      'error',
      'config',
      `Couldn't find project config file 'lostpixel.config.(${configExtensionsString})'`,
    );
    process.exit(1);
  }

  if (configFiles.length > 1) {
    log.process(
      'info',
      'config',
      '✅ Found multiple config files, taking:',
      configFiles[0],
    );
  } else {
    log.process('info', 'config', '✅ Found config file:', configFiles[0]);
  }

  const configFile = configFiles[0];

  try {
    const imported = (await loadProjectConfigFile(configFile)) as Config;

    return imported;
  } catch {
    log.process(
      'error',
      'config',
      'Loading config using ESBuild failed, using fallback option',
    );

    try {
      if (existsSync(`${configFileNameBase}.js`)) {
        const projectConfig =
          // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
          require(`${configFileNameBase}.js`) as Config;

        log.process(
          'info',
          'config',
          '✅ Successfully loaded configuration from:',
          `${configFileNameBase}.js`,
        );

        return projectConfig;
      }

      if (existsSync(`${configFileNameBase}.ts`)) {
        const imported = (await loadTSProjectConfigFile(configFile)) as Config;

        log.process(
          'info',
          'config',
          '✅ Successfully loaded configuration from:',
          `${configFileNameBase}.ts`,
        );

        return imported;
      }

      log.process(
        'error',
        'config',
        "Couldn't find project config file 'lostpixel.config.js'",
      );
      process.exit(1);
    } catch (error) {
      log.process(
        'error',
        'config',
        `Failed to load config file: ${configFile}`,
      );
      log.process('error', 'config', error);
      process.exit(1);
    }
  }
};

export const configure = async (
  customProjectConfig?: CustomProjectConfig,
  localDebugMode?: boolean,
) => {
  if (customProjectConfig) {
    config = parseConfig(customProjectConfig as Config);

    return;
  }

  let loadedProjectConfig = await loadProjectConfig();

  if (localDebugMode) {
    let localDebugConfig = loadedProjectConfig;

    if (isPlatformModeConfig(loadedProjectConfig)) {
      localDebugConfig = {
        ...loadedProjectConfig,
        generateOnly: true,
        // @ts-expect-error Force it into generateOnly mode by dropping the platform specific properties
        lostPixelProjectId: undefined,
        // @ts-expect-error Force it into generateOnly mode by dropping the platform specific properties
        apiKey: undefined,
      };
    }

    const urlChunks = ['http://', 'https://', '127.0.0.1'];

    if (
      localDebugConfig.pageShots?.baseUrl &&
      urlChunks.some((urlChunk) =>
        localDebugConfig?.pageShots?.baseUrl.includes(urlChunk),
      )
    ) {
      const url = new URL(localDebugConfig.pageShots.baseUrl);

      url.hostname = 'localhost';
      localDebugConfig.pageShots.baseUrl = url.toString();
    }

    loadedProjectConfig = localDebugConfig;
  }

  // Default to Storybook mode if no mode is defined
  if (
    !loadedProjectConfig.storybookShots &&
    !loadedProjectConfig.pageShots &&
    !loadedProjectConfig.ladleShots &&
    !loadedProjectConfig.histoireShots &&
    !loadedProjectConfig.customShots
  ) {
    loadedProjectConfig.storybookShots = {
      storybookUrl: 'storybook-static',
    };
  }

  config = parseConfig(loadedProjectConfig);
};
