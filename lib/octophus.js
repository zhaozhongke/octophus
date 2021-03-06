'use babel';

import OpenGithubDiag from './dialogs/open-github-dialog';
import CreateFileDiag from './dialogs/create-file-directory-dialog';
import CommitMessageDialog from './dialogs/commit-message-dialog';
import StatusView from './view/status-view';
import { CompositeDisposable } from 'atom';
import packageConfig from './config.json';
import githubAPI from './github-integrate/auth';
import Repository from './github-integrate/repository';
import Directory from './directory';
import TreeView from './view/tree-view';
import File from './file';
import path from 'path';


export default {
  config: packageConfig,
  modalPanel: null,
  subscriptions: null,
  treeView: null,

  activate(state) {
    atom.project.octophus = {};
    atom.project.octophusdir = new Directory({
      parent: null,
      name: "/"
    });

    atom.project.octophus.openfiles = {}

    dir = atom.project.octophusdir;
    dir.name = "<empty>";

    dir2 = new Directory({
      parent: null,
      name: "hello"
    });

    if (!this.treeView) {
      this.treeView = new TreeView();
    }
    this.treeView.detach();
    atom.project.octophustree = this.treeView;

    atom.commands.add('atom-workspace', {

      'octophus:toggle': () => this.toggle(),

      'octophus:do-commit-message': () => this.showCommit(),

      'octophus:open-repo': () => {
        if (!githubAPI.tokenReady) {
          atom.notifications.addError("Please set GitHub Token first in octophus!");
          return;
        }
        let dialog = new OpenGithubDiag();
        dialog.on('open-repo', (e, fullrepo) => {
          dialog.detach();

          let result = /^([a-zA-Z0-9\-_\.]+)\/([a-zA-Z0-9\-_\.]+)(:[a-zA-Z0-9\-_\.]+)?$/.exec(fullrepo);
          if (!result) {
            atom.notifictations.addError("Can't open the repo");
            return;
          }

          atom.workspace.getPaneItems().forEach(() =>
            atom.workspace.destroyActivePaneItem());

          let user = result[1];
          let repo = result[2];
          let branch = result[3] ? result[3].slice(1) : "";

          atom.notifications.addInfo("Opening " + fullrepo);

          this.statusView.attach();
          this.treeView.attach();

          this.statusView.notifyFetching('start');

          atom.project.octophus.repository = new Repository(user, repo, branch);
          atom.project.octophus.repository.getDirectory()
            .then(ghDir => new Directory({
              parent: null,
              name: ghDir.repo.name,
              ghDir: ghDir
            }).open())
            .then((dir) => {
              atom.project.octophustree.setRoot(dir);
              if (!atom.project.octophustree.isVisible()) {
                atom.project.octophustree.toggle();
              }
              atom.notifications.addInfo("GitHub repo opened");
            })
            .catch(err => {
              atom.notifications.addError("Can't open the GitHub repo");
            })
            .finally(() => {
              this.statusView.notifyFetching('end');
            });
        });
        dialog.attach();
      },

      'octophus:add-file': () => {
        let view = atom.project.octophustree.getSelected();
        let dir = view[0].item;
        console.log(dir);
        let ghDir = dir.ghDir;
        let ghFile = dir.ghFile;
        let __type;
        if (ghDir) {
          __type = 'folder';
        }
        if (ghFile) {
          __type = 'file';
        }
        if (__type == 'folder') {
          let dialog = new CreateFileDiag();
          dialog.on('do-create', (e, name) => {
            dialog.detach();
            this.statusView.attach();

            ghDir.createFile(name).then((newFile) => {
              console.log(newFile);
              let name = path.basename(newFile.path);
              let file = new File({
                parent: dir,
                name: name,
                ghFile: newFile
              });
              dir.files.push(file);
              atom.project.octophustree.root.repaint();
              file.openNewFile();
            });
          });
          dialog.attach();
        }
      }
    });

    atom.workspace.observeTextEditors((ed) => {
      const buffer = ed.buffer;
      let path = null;

      const listener = buffer.onDidSave((ev) => {
        path = ev.path;
        buffer.__MAGIC_DO_NOT_MODIFY && buffer.__MAGIC_DO_NOT_MODIFY.save();
      });
      const listener2 = buffer.onDidDestroy(() => {
        buffer.__MAGIC_DO_NOT_MODIFY && atom.project.octophus.repository.saveAll();
        listener.dispose();
        listener2.dispose();
      });

    });

    atom.config.observe('octophus.githubToken', this.setGithubToken);
  },

  setGithubToken: (token) => {
    if (!token || token.length <= 20) {
      atom.notifications.addWarning("Please set GitHub Token in octophus first.");
      atom.notifications.addWarning("We need repo access for github. See https://github.com/settings/tokens/new");
      if (this.statusView) {
        this.statusView.updateStatusText('token');
      }
      return;
    }
    console.log("?????", token);
    githubAPI.tokenReady = true;
    githubAPI.authenticate({
      type: "token",
      token: token
    });
    if (this.statusView) {
      atom.notifications.addInfo("GitHub token is set");
      this.statusView.updateStatusText('synced');
    }
  },

  consumeStatusBar(statusBar) {
    this.statusView = new StatusView();
    this.statusView.initialize(statusBar);
    if (!githubAPI.tokenReady) {
      this.statusView.attach('token');
    }
  },

  deactivate() {
    this.treeView.detach();
    this.modalPanel.destroy();
    this.subscriptions.dispose();
  },

  serialize() {
    return;
  },

  toggle() {
    this.treeView.toggle();
    console.log('Octophus was toggled!');
    return;
  },

  showCommit() {
    if (atom.project.octophusdir.name === '<empty>') {
      atom.notifications.addError('You have not yet open a repo');
      return;
    }
    let dialog = new CommitMessageDialog();
    dialog.attach();
    dialog.on('do-commit-message', (e, msg) => {
      dialog.detach();
      if (msg) {
        this.saveCommitMessage(msg);
      }
    })
  },

  saveCommitMessage(msg) {
    this.statusView.notifySaving('start');
    atom.project.octophus.repository.amendCommitMessage(msg)
      .finally(() => {
        this.statusView.notifySaving('end');
      })
  }

};
