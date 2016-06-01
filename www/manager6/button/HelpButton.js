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
    controller: {
	xclass: 'Ext.app.ViewController',
	listen: {
	    global: {
		pveShowHelp: 'onPveShowHelp',
		pveHideHelp: 'onPveHideHelp'
	    }
	},
	onPveShowHelp: function(helpLink) {
	    this.getView().setHandler(function() {
		var docsURI = window.location.origin +
		'/pve-docs/' + helpLink;
		window.open(docsURI);
	    });
	    this.getView().show();
	},
	onPveHideHelp: function() {
	    this.getView().hide();
	}
    }
});