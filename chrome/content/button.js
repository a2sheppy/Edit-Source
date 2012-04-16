/* vim:set ts=2 sw=2 sts=2 et tw=80:
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Edit Source extension.
 *
 * The Initial Developer of the Original Code is
 * The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Eric Shepherd <sheppy@sheppyware.net> (original author)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK *****/

var sourceEditorExample = {
  // Called at startup to initialize the extension
  startup: function() {
    if (document.getElementById("contentAreaContextMenu")) {
      Components.utils.import("resource:///modules/source-editor.jsm");
      Components.utils.import("resource://gre/modules/NetUtil.jsm");
      Components.utils.import("resource://gre/modules/FileUtils.jsm");
      Components.utils.import("resource://gre/modules/Services.jsm");

      // Watch for right clicks

      document.getElementById("contentAreaContextMenu")
              .addEventListener("popupshowing",
                      sourceEditorExample.onPopup, false);
      
      // See if the content is editable and adjust menus accordingly
      
      var webDevItem = document.getElementById("edit-source-webdev-item");
      var fxItem = document.getElementById("edit-source-appmenu-item");
      
      if (sourceEditorExample.getExtensionForType(
                gBrowser.contentDocument.contentType)) {
        webDevItem.disabled = false;
        fxItem.disabled = false;
      } else {
        webDevItem.disabled = true;
        fxItem.disabled = true;
      }
    }
  },
  
  // Called when the context menu is opened, to do menu item setup
  
  onPopup: function() {
    var node = sourceEditorExample.getCurrentNode();
    var linkMenuItem = document.getElementById("edit-source_menuitem");
    var pageMenuItem = document.getElementById("edit-source_menuitem_thispage");
    
    // If the click wasn't on a link, let's use this page instead
    
    if (!node) {
      linkMenuItem.hidden = true;
      url = gBrowser.contentDocument.location.href;
      
      if (sourceEditorExample.getExtensionForType(
              gBrowser.contentDocument.contentType)) {
        pageMenuItem.hidden = false;
      } else {
        pageMenuItem.hidden = true;
      }
    } else {
      pageMenuItem.hidden = true;
      menuItem = linkMenuItem;
      url = sourceEditorExample.getTargetURL(node);
      if (sourceEditorExample.getType(url)) {
        linkMenuItem.hidden = false;
      } else {
        linkMenuItem.hidden = true;
      }
    }
  },
  
  // Gets the URL target for the specified node; returns
  // null if the node isn't a link.
  getTargetURL: function(node) {
    var elemName = node.localName.toUpperCase();
    var attrName = "";
    var src = null;
    
    switch(elemName) {
      case "A":
        attrName = "href";
        break;
      case "SCRIPT":
        attrName = "src";
        break;
    }
    
    if (attrName.length) {
     src = node.getAttribute(attrName);
    }
    
    return src;
  },
  
  // Called to open the right-clicked link in the editor, or, if not on a link,
  // the current page you're looking at
  openInEditor: function(what) {
    var node = sourceEditorExample.getCurrentNode();

    if (!node) {
      src = gBrowser.contentDocument.location.href;
    } else {
      src = sourceEditorExample.getTargetURL(node);
    }
    
    if (src && src != "") {
      sourceEditorExample.openUrl(src, what);
    }
  },
  
  // Event handler for edit window's load event
  onWindowLoad: function(editWin, src, what) {
    editWin.removeEventListener("load", sourceEditorExample.onWindowLoad, false);

    editWin.sourceEditorURL = src;
    editWin.sourceEditor = editWin.arguments[0];
    
    // For "link" editors, disable the "Update Page" menu option
    
    if (what == "link") {
      var mitem = editWin.document.getElementById("update-page");
      mitem.setAttribute("disabled", "true");
      
      mitem = editWin.document.getElementById("cUpdate-page");
      mitem.setAttribute("disabled", "true");
    }
    
    // Stash some data we need into the editor object and create
    // the new editor.
    
    editWin.sourceEditor.stringsBundle = editWin.document
                                              .getElementById("editor-strings");
    editWin.sourceEditorObj = new SourceEditor();
    
    // Load content into the editor
    
    editWin.sourceEditor.readFileIntoEditor(src, editWin);
  },
  
  // Handle closing the editor window
  onWindowClose: function(evt, editWin) {
    if (!editWin.sourceEditorObj) {
      return;
    }
    
    if (editWin.sourceEditorObj.dirty) {
      var titleString = editWin.sourceEditor.stringsBundle
                               .getString("savePromptTitle");
      var msgString = editWin.sourceEditor.stringsBundle
                               .getString("savePromptMessage");
      
      var prompts = Services.prompt;
      var flags = prompts.BUTTON_TITLE_SAVE * prompts.BUTTON_POS_0 +
                  prompts.BUTTON_TITLE_CANCEL * prompts.BUTTON_POS_1 +
                  prompts.BUTTON_TITLE_DONT_SAVE * prompts.BUTTON_POS_2;
      var result = prompts.confirmEx(editWin, titleString, msgString, flags,
                          "", "", "", null, {});
      
      switch(result) {
        case 0:   // Save
          editWin.sourceEditor.save(editWin);
          break;
        case 1:   // Cancel
          evt.preventDefault();
          break;
        case 2:   // Don't save
          break;
      }
    }
  },
  
  // Opens the specified URL in a new source editor window; |what|
  // is either "page" or "link"; the latter will disable the
  // "Update Page" menu option.
  openUrl: function(src, what) {
    var windowFeatures = "chrome,toolbar=no,resizable=yes,dialog=no," +
                         "width=600,height=400";
    
    this.document = gBrowser.contentDocument;
    
    var editWin = window.openDialog(
                    "chrome://source-editor/content/edit-window.xul", "_blank",
                    windowFeatures, this);
    
    // Get ready to set up the editor once the window is opened
    editWin.addEventListener("load", function() {
            sourceEditorExample.onWindowLoad(editWin, src, what);
      }, false);
      
    // Get ready to intercept the close if the content is changed but not saved
    editWin.addEventListener("close", function(evt) {
          sourceEditorExample.onWindowClose(evt, editWin);
      }, false);
  },
  
  // Given a MIME type, return the extension we use for that type. Returns
  // null if it's not a supported type.
  getExtensionForType: function(type) {
    // Remove any stuff after the semicolon; we don't care
    
    var semiPos = type.indexOf(";");
    if (semiPos != -1) {
      type = type.slice(0, semiPos);
    }
    
    // Handle specific types
    
    switch(type) {
      case "text/html":
      case "text/xhtml":
      case "application/xhtml":
      case "application/xhtml+xml":
        return "html";
      case "application/javascript":
        return "js";
      case "text/xml":
        return "xml";
      case "text/css":
        return "css";
      case "application/php":
      case "application/x-php":
      case "application/x-httpd-php":
      case "application/x-httpd-php-source":
        return "txt";
    }
    
    // Anything else that starts with "text/" should be accepted as a text file
    
    if (type.slice(0, 4).toLowerCase() == "text/") {
      return "txt";
    }
    
    // Unsupported type

    return null;
  },
  
  // Get the type of the specified URL given its MIME type;
  // returns null for unsupported types. This restricts us
  // down to supported types.
  getType: function(src) {
    // special case about:blank
    
    if (src.toLowerCase() == "about:blank") {
      return "html";
    }
    var type = sourceEditorExample.getContentType(src);
    
    if (!type) {
      return null;
    }
    
    return sourceEditorExample.getExtensionForType(type);
  },
  
  // Return the MIME type for the specified url; returns
  // null if unable to get the type  
  getContentType: function(url) {
    var req = new XMLHttpRequest();
    var type = null;
    
    // Get the full URL, in case it's a partial
    
    var file = NetUtil.newURI(src, document.characterSet,
          gBrowser.selectedBrowser.contentDocument.documentURIObject);
    url = file.spec;
    
    // Yes, this is a synchronous request. Since our UI can't continue
    // until it's handled anyway, it might as well be.
    
    try {
      req.open("HEAD", url, false);
      req.send(null);
      
      if (req.status == 200) {
        type = req.getResponseHeader("Content-Type");
      }
    } catch(ex) {
      type = null;
    }
    
    return type;
  },
  
  // Get just the filename of the specified file.
  getFilename: function(src) {
    var lastSlashPos = src.lastIndexOf("/");
    
    if (lastSlashPos == -1) {
      return src;
    }
    
    return src.slice(lastSlashPos+1);
  },
  
  // Read the file into the editor.
  readFileIntoEditor: function(src, editWin) {
    var file = NetUtil.newURI(src, document.characterSet,
          gBrowser.selectedBrowser.contentDocument.documentURIObject);

    NetUtil.asyncFetch(file, function(inputStream, status) {
      if (!Components.isSuccessCode(status)) {
        var aStr = editWin.sourceEditor.stringsBundle
                                 .getString("alertLoadError");
        alert(aStr);
        return;
      }

      // Pick a mode based on the file's MIME type
      
      var textMode = SourceEditor.MODES.TEXT;
      var ext = sourceEditorExample.getType(src);
      
      if (!ext) {
        return;     // Do nothing if not a supported type
      }
  
      switch(ext) {
        case 'html':
          textMode = SourceEditor.MODES.HTML;
          break;
        case 'js':
          textMode = SourceEditor.MODES.JAVASCRIPT;
          break;
        case 'xml':
          textMode = SourceEditor.MODES.XML;
          break;
        case 'css':
          textMode = SourceEditor.MODES.CSS;
          break;
      }
      
      // If there's data, read it; otherwise we'll use an empty string
      
      var data = "";
      
      try {
        data = NetUtil.readInputStreamToString(inputStream,
                       inputStream.available());
        inputStream.close();
      } catch(e) {
      }
      
      var config = {
        showLineNumbers: true,
        initialText: data,
        tabSize: 2,
        expandTab: true,
        mode: textMode
      };
      
      var doc = editWin.document;
      var hbox = doc.getElementById("editbox");
      var ttl = editWin.sourceEditor.stringsBundle
                         .getString("windowTitleString");

      doc.title = ttl + " " + src;
    
      editWin.sourceEditorObj.init(hbox, config,
            sourceEditorExample.editorLoaded);
    });
  },
  
  // Set the syntax highlighting mode for the document
  setSyntax: function(editWin, ext) {
    switch(ext) {
      case 'html':
        textMode = SourceEditor.MODES.HTML;
        break;
      case 'js':
        textMode = SourceEditor.MODES.JAVASCRIPT;
        break;
      case 'xml':
        textMode = SourceEditor.MODES.XML;
        break;
      case 'css':
        textMode = SourceEditor.MODES.CSS;
        break;
      default:
        return;   // Don't do anything for unknown types
    }
    
    editWin.sourceEditorObj.setMode(textMode);
    var mitem = editWin.document.getElementById(ext + "-mode");
    mitem.setAttribute("checked", "true");
  },
  
  // Update the position display in the status bar
  updatePositionDisplay: function(editor) {
    var target = editor.editorElement;
    var posLabel = target.ownerDocument.getElementById("position");
    var pos = editor.getCaretPosition();
    
    posLabel.value = pos.col + ", " + pos.line;
  },
  
  // Update the dirty status display
  dirtyChanged: function(editor, dirtyFlag) {
    var target = editor.editorElement;
    var dirtyLabel = target.ownerDocument.getElementById("unsaved");
    
    var str = "";
    
    if (dirtyFlag) {
      str = target.ownerDocument.getElementById("editor-strings")
                  .getString("unsaved");
    }
    dirtyLabel.value = str;
  },
  
  // Update the size display in the status bar
  updateSizeDisplay: function(editor) {
    var target = editor.editorElement;    
    var sizeLabel = target.ownerDocument.getElementById("size");
    
    sizeLabel.value = editor.getLineCount() + " / " + editor.getCharCount();
  },
  
  // Timeout handler called when idle to refresh the
  // size information
  handleTimeout: function(editor) {
    sourceEditorExample.updateSizeDisplay(editor);
    editor.timeoutID = window.setTimeout(function() {
          sourceEditorExample.handleTimeout(editor);
        }, 1000);
  },
  
  // Reset the timeout handler to prevent it from happening too often;
  // we call this every time the text changes
  resetTimeout: function(editor) {
    if (editor.timeoutID != -1) {
      window.clearTimeout(editor.timeoutID);
    }
    editor.timeoutID = window.setTimeout(function() {
          sourceEditorExample.handleTimeout(editor);
        }, 1000);
  },
  
  // Called by the editor once the editor is loaded and ready for content;
  // receives as input the SourceEditor object that's ready.
  editorLoaded: function(editor) {
    var target = editor.editorElement;  // Get the element to listen on
    
    editor.timeoutID = -1;
    
    // When the text is changed, reset the timeout handler to avoid
    // refreshing the status bar too often
    editor.addEventListener(SourceEditor.EVENTS.TEXT_CHANGED, function() {
        sourceEditorExample.resetTimeout(editor);
      });
    
    // Invoke our timeout handler to set the initial state and
    // create the initial timeout.
    
    sourceEditorExample.handleTimeout(editor);
    
    // When the selection changes, update the position info in the status bar
    editor.addEventListener(SourceEditor.EVENTS.SELECTION, function() {
        sourceEditorExample.updatePositionDisplay(editor);
      });
    
    // Listen for changes to the dirty flag
    editor.addEventListener(SourceEditor.EVENTS.DIRTY_CHANGED, function(e) {
        sourceEditorExample.dirtyChanged(editor, e.newValue);
      });
    
    // Check the menu item for the appropriate syntax mode
    
    var editWin = target.ownerDocument.defaultView;
    sourceEditorExample.setSyntax(editWin,
          sourceEditorExample.getType(editWin.sourceEditorURL));
  },
    
  // Returns the Node for the one the user right clicked, but only
  // if it's one we support opening in the editor. Otherwise null.
  getCurrentNode: function() {
    var node = document.popupNode;
    
    // If there's no node, just return null now.
    
    if (node == undefined || !node) {
      return null;
    }
    
    // Is it a link to something we can try opening?
    
    var elemName = node.localName.toUpperCase();
    
    if (elemName == "A" || elemName == "SCRIPT") {
      return node;
    }
    
    // No, so return null
    
    return null;
  },
  
  // Handle the "Save as..." menu item
  save: function(editWin) {
    var Ci = Components.interfaces;
    var Cc = Components.classes;
    var nsIFilePicker = Ci.nsIFilePicker;
    var savePicker = Cc["@mozilla.org/filepicker;1"]
                       .createInstance(nsIFilePicker);
    var type = sourceEditorExample.getType(editWin.sourceEditorURL);
    
    var pickerTitle = editWin.sourceEditor.stringsBundle
                             .getString("savePickerTitle");
    savePicker.init(window, pickerTitle, nsIFilePicker.modeSave);
    
    // Configure the picker
    
    savePicker.addToRecentDocs = true;
    savePicker.defaultString =
          sourceEditorExample.getFilename(editWin.sourceEditorURL);
    if (!type || type == "") {
      type = "html";
    }
    savePicker.defaultExtension = type;
    
    var result = savePicker.show();
    
    if (result != nsIFilePicker.returnCancel) {
      var outStream = FileUtils.openSafeFileOutputStream(savePicker.file);
      var converter =
            Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                      .createInstance(Ci.nsIScriptableUnicodeConverter);
      converter.charset = "UTF-8";
      
      var inStream = converter.convertToInputStream(
            editWin.sourceEditorObj.getText());
      
      NetUtil.asyncCopy(inStream, outStream, function(result) {
              if (Components.isSuccessCode(result)) {
                editWin.sourceEditorObj.dirty = false;    // Flag as unchanged
              } else {
                var aStr = editWin.sourceEditor.stringsBundle
                                         .getString("alertLoadError");
                alert(alertSaveError + " " + result);
              }
      });
    }
  },
  
  // Update the displayed page based on the text in the editor
  updatePage: function(editWin) {
    var type = editWin.sourceEditor.document.contentType;
    
    switch(type) {
      case "html":
        var newText = editWin.sourceEditorObj.getText();
        editWin.sourceEditor.document.documentElement.innerHTML = newText;
        
        // Now some funky code to build a DOM tree for the new document,
        // then pull out its <head> to insert into the page.
        
        try {
          var parser = new DOMParser();
          var headDoc = parser.parseFromString(newText, "text/html");
          
          editWin.sourceEditor.document.head.innerHTML = headDoc.head.innerHTML;
        } catch(e) {
          // don't error; we don't NEED a head block
        }
        break;
    }
  }
};

window.addEventListener("load", function(e) { sourceEditorExample.startup(); },
      false);