/* help button pointing to an online documentation
   for components contained in a modal window
*/
/*global
  pveOnlineHelpInfo
*/
Ext.define('PVE.button.Help', {
    extend: 'Ext.button.Button',
    alias: 'widget.pveHelpButton',
    text: gettext('Help'),
    // make help button less flashy by styling it like toolbar buttons
    iconCls: ' x-btn-icon-el-default-toolbar-small fa fa-question-circle',
    cls: 'x-btn-default-toolbar-small pve-inline-button',
    hidden: true,
    listenToGlobalEvent: true,
    controller: {
	xclass: 'Ext.app.ViewController',
	listen: {
	    global: {
		pveShowHelp: 'onPveShowHelp',
		pveHideHelp: 'onPveHideHelp'
	    }
	},
	onPveShowHelp: function(helpLink) {
	    var me = this.getView();
	    if (me.listenToGlobalEvent === true) {
		me.setOnlineHelp(helpLink);
		me.show();
	    }
	},
	onPveHideHelp: function() {
	    var me = this.getView();
	    if (me.listenToGlobalEvent === true) {
		me.hide();
	    }
	}
    },

    // this sets the link and
    // sets the tooltip text
    setOnlineHelp:function(blockid) {
	var me = this;

	var info = pveOnlineHelpInfo[blockid];
	if (info) {
	    me.onlineHelp = blockid;
	    var title = info.title;
	    if (info.subtitle) {
		title += ' - ' + info.subtitle;
	    }
	    me.setTooltip(title);
	}
    },

    // helper to set the onlineHelp via a config object
    setHelpConfig: function(config) {
	var me = this;
	me.setOnlineHelp(config.onlineHelp);
    },

    handler: function() {
	var me = this;
	var docsURI;

	if (me.onlineHelp) {
	    var info = pveOnlineHelpInfo[me.onlineHelp];
	    if (info) {
		docsURI = window.location.origin + info.link;
	    }
	}

	if (docsURI) {
	    window.open(docsURI);
	} else {
	    Ext.Msg.alert(gettext('Help'), gettext('No Help available'));
	}
    }
});
