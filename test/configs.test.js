const configs = require('../src/lib/configs');
const rpc = require('../src/lib/rpc');
const inquirer = require('inquirer');
const findUp = require('find-up');

describe('config.js', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('getProjectConfig', () => {
    describe('when projectConfig is valid', () => {
      let projectConfig;
      beforeEach(async () => {
        jest
          .spyOn(rpc, 'readFile')
          .mockReturnValue(
            Promise.resolve(JSON.stringify({ upstream: 'elastic/kibana' }))
          );

        projectConfig = await configs.getProjectConfig();
      });

      it('should call findUp', () => {
        expect(findUp).toHaveBeenCalledWith('.backportrc.json');
      });

      it('should return config', () => {
        expect(projectConfig).toEqual({ upstream: 'elastic/kibana' });
      });
    });

    describe('when projectConfig is empty', () => {
      it('should throw error', () => {
        jest.spyOn(rpc, 'readFile').mockReturnValueOnce(Promise.resolve('{}'));
        expect.assertions(1);

        return configs.getProjectConfig().catch(e => {
          expect(e.message).toContain(
            'The project config file (/path/to/config) is not valid'
          );
        });
      });
    });

    describe('when projectConfig is missing', () => {
      it('should throw error', () => {
        findUp.mockReturnValue(Promise.resolve(null));
        expect.assertions(1);
        return expect(configs.getProjectConfig()).resolves.toBe(null);
      });
    });
  });

  describe('getGlobalConfig', () => {
    let res;
    beforeEach(async () => {
      jest.spyOn(rpc, 'mkdirp').mockReturnValue(Promise.resolve());
      jest.spyOn(rpc, 'writeFile').mockReturnValue(Promise.resolve());
      jest.spyOn(rpc, 'statSync').mockReturnValue({ mode: 33152 });
      jest.spyOn(rpc, 'readFile').mockReturnValue(
        Promise.resolve(
          JSON.stringify({
            accessToken: 'myAccessToken',
            username: 'sqren'
          })
        )
      );
      res = await configs.getGlobalConfig();
    });

    it("should create config if it doesn't exist", () => {
      expect(rpc.writeFile).toHaveBeenCalledWith(
        '/myHomeDir/.backport/config.json',
        '{"accessToken":"myAccessToken","username":"sqren"}',
        { flag: 'wx', mode: 384 }
      );
    });

    it("should create config folders if it they don't exist", () => {
      expect(rpc.mkdirp).toHaveBeenCalledWith(
        '/myHomeDir/.backport/repositories'
      );
    });

    it('should load configTemplate', () => {
      expect(rpc.readFile).toHaveBeenCalledWith(
        expect.stringContaining('/src/lib/configTemplate.json'),
        'utf8'
      );
    });

    it('should load config', () => {
      expect(rpc.readFile).toHaveBeenCalledWith(
        '/myHomeDir/.backport/config.json',
        'utf8'
      );
    });

    it('should return config', () => {
      expect(res).toEqual({
        accessToken: 'myAccessToken',
        username: 'sqren'
      });
    });
  });

  describe('maybeCreateGlobalConfig', () => {
    it('should create config and succeed', async () => {
      jest.spyOn(rpc, 'writeFile').mockReturnValue(Promise.resolve());
      await configs.maybeCreateGlobalConfig();

      expect(rpc.writeFile).toHaveBeenCalledWith(
        '/myHomeDir/.backport/config.json',
        expect.stringContaining('"accessToken": ""'),
        { flag: 'wx', mode: 384 }
      );
    });

    it('should not fail if config already exists', () => {
      const err = new Error();
      err.code = 'EEXIST';
      jest
        .spyOn(rpc, 'writeFile')
        .mockImplementationOnce(() => Promise.reject(err));

      return configs.maybeCreateGlobalConfig();
    });
  });

  describe('mergeConfigs', () => {
    it('should use globalConfig if projectConfig is missing', () => {
      const projectConfig = null;
      const globalConfig = {
        accessToken: 'myAccessToken',
        username: 'sqren',
        projects: [
          {
            upstream: 'elastic/kibana',
            branches: ['6.1', '6.0']
          }
        ]
      };
      const upstream = 'elastic/kibana';
      expect(
        configs.mergeConfigs(projectConfig, globalConfig, upstream)
      ).toEqual({
        accessToken: 'myAccessToken',
        username: 'sqren',
        upstream: 'elastic/kibana',
        branches: ['6.1', '6.0']
      });
    });

    it('should use projectConfig', () => {
      const projectConfig = {
        upstream: 'elastic/kibana',
        branches: ['6.2', '6.0']
      };
      const globalConfig = {
        accessToken: 'myAccessToken',
        username: 'sqren',
        projects: []
      };
      const upstream = 'elastic/kibana';
      expect(
        configs.mergeConfigs(projectConfig, globalConfig, upstream)
      ).toEqual({
        accessToken: 'myAccessToken',
        username: 'sqren',
        upstream: 'elastic/kibana',
        branches: ['6.2', '6.0']
      });
    });

    it('should override projectConfig with globalConfig', () => {
      const projectConfig = {
        upstream: 'elastic/kibana',
        branches: ['6.2', '6.0']
      };
      const globalConfig = {
        accessToken: 'myAccessToken',
        username: 'sqren',
        projects: [
          {
            upstream: 'elastic/kibana',
            branches: ['6.1', '6.0']
          }
        ]
      };
      const upstream = 'elastic/kibana';
      expect(
        configs.mergeConfigs(projectConfig, globalConfig, upstream)
      ).toEqual({
        accessToken: 'myAccessToken',
        username: 'sqren',
        upstream: 'elastic/kibana',
        branches: ['6.1', '6.0']
      });
    });
  });

  describe('getCombinedConfig', () => {
    describe('when both configs are empty', () => {
      it('should throw InvalidConfigError', () => {
        expect.assertions(1);
        return configs._getCombinedConfig(null, {}).catch(e => {
          expect(e.message).toEqual(
            'Global config (/myHomeDir/.backport/config.json) does not contain any valid projects, and no project config (.backportrc.json) was found.\nDocumentation: https://github.com/sqren/backport#global-configuration'
          );
        });
      });
    });

    describe('when project config exists', () => {
      let res;
      beforeEach(async () => {
        res = await configs._getCombinedConfig(
          {
            upstream: 'elastic/kibana',
            branches: ['6.x', '6.1']
          },
          {
            username: 'sqren',
            accessToken: 'myAccessToken'
          }
        );
      });

      it('should return correct config', () => {
        expect(res).toEqual({
          accessToken: 'myAccessToken',
          username: 'sqren',
          upstream: 'elastic/kibana',
          branches: ['6.x', '6.1']
        });
      });
    });

    describe('when project config does not exists and global config has projects', () => {
      let res;
      beforeEach(async () => {
        jest.spyOn(inquirer, 'prompt').mockReturnValueOnce(
          Promise.resolve({
            promptResult: 'elastic/kibana'
          })
        );

        res = await configs._getCombinedConfig(null, {
          username: 'sqren',
          accessToken: 'myAccessToken',
          projects: [
            {
              upstream: 'elastic/kibana',
              branches: ['6.x', '6.1']
            },
            {
              upstream: 'elastic/elasticsearch',
              branches: ['6.x', '6.1']
            }
          ]
        });
      });

      it('should call prompt with correct args', () => {
        expect(inquirer.prompt).toHaveBeenCalledWith([
          expect.objectContaining({
            choices: ['elastic/kibana', 'elastic/elasticsearch']
          })
        ]);
      });

      it('should return correct config', () => {
        expect(res).toEqual({
          accessToken: 'myAccessToken',
          username: 'sqren',
          upstream: 'elastic/kibana',
          branches: ['6.x', '6.1']
        });
      });
    });
  });

  describe('validateProjectConfig', () => {
    it('should fail if config is invalid', () => {
      expect(() =>
        configs.validateProjectConfig(
          { upstream: 1337 },
          '/path/to/.backportrc.json'
        )
      ).toThrowErrorMatchingSnapshot();
    });

    it('should return valid config', () => {
      const config = { upstream: 'elastic/kibana', branches: ['6.1', '6.x'] };
      expect(
        configs.validateProjectConfig(config, '/path/to/.backportrc.json')
      ).toBe(config);
    });
  });

  describe('validateGlobalConfig', () => {
    beforeEach(() => {
      jest.spyOn(rpc, 'statSync').mockReturnValue({ mode: 33152 });
    });

    it('should fail if config is invalid', () => {
      expect(() =>
        configs.validateGlobalConfig(
          { username: 1337 },
          '/path/to/.backport/config.json'
        )
      ).toThrowErrorMatchingSnapshot();
    });

    it('should return valid config', () => {
      const config = { username: 'sqren', accessToken: 'myAccessToken' };
      expect(
        configs.validateGlobalConfig(config, '/path/to/.backport/config.json')
      ).toBe(config);
    });
  });
});
