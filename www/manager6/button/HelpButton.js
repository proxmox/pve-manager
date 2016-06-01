/* help button pointing to an online documentation
   for components contained in a modal window
 */
Ext.define('PVE.button.Help', {
    extend: 'Ext.button.Button',
    alias: 'widget.pveHelpButton',
    text: gettext('Help'),
    iconCls: 'fa fa-question-circle',
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