/* help button pointing to an online documentation
   for components contained in a modal window
 */
Ext.define('PVE.button.Help', {
    extend: 'Ext.button.Button',
    alias: 'widget.pveHelpButton',
    text: gettext('Help'),
    // make help button less flashy by styling it like toolbar buttons
    iconCls: ' x-btn-icon-el-default-toolbar-small fa fa-question-circle',
    cls: 'x-btn-default-toolbar-small pve-help-button',
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
	    if (me.listenGlobalEvent === true) {
		me.hide();
	    }
	}
    },

    // this sets the link and
    // sets the tooltip text
    setOnlineHelp:function(link) {
	var me = this;
	me.onlineHelp = link;
	me.setTooltip(PVE.Utils.mapDocsUrlToTitle(link));
    },

    handler: function() {
	var me = this;
	if (me.onlineHelp) {
	    var docsURI = window.location.origin + '/pve-docs/' + me.onlineHelp;
	    window.open(docsURI);
	} else {
	    Ext.Msg.alert(gettext('Help'), gettext('No Help available'));
	}
    }
});
