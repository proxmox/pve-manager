Ext.define('PVE.window.Settings', {
    extend: 'Ext.window.Window',

    width: '400px',
    title: gettext('My Settings'),
    iconCls: 'fa fa-gear',
    modal: true,
    bodyPadding: 10,
    resizable: false,

    buttons: [{
	text: gettext('Close'),
	handler: function() {
	    this.up('window').close();
	}
    }],

    layout: {
	type: 'vbox',
	align: 'center'
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	control: {
	    '#': {
		show: function() {
		    var me = this;
		    var sp = Ext.state.Manager.getProvider();

		    var username = sp.get('login-username') || PVE.Utils.noneText;
		    me.lookupReference('savedUserName').setValue(username);
		}
	    },
	    'button[name=reset]': {
		click: function () {
		    var blacklist = ['GuiCap', 'login-username'];
		    var sp = Ext.state.Manager.getProvider();
		    var state;
		    for (state in sp.state) {
			if (sp.state.hasOwnProperty(state)) {
			    if (blacklist.indexOf(state) !== -1) {
				continue;
			    }

			    sp.clear(state);
			}
		    }

		    window.location.reload();
		}
	    },
	    'button[name=clear-username]': {
		click: function () {
		    var me = this;
		    var usernamefield = me.lookupReference('savedUserName');
		    var sp = Ext.state.Manager.getProvider();

		    usernamefield.setValue(PVE.Utils.noneText);
		    sp.clear('login-username');
		}
	    }
	}
    },

    items: [{
	    xtype: 'fieldset',
	    width: '90%',
	    title: gettext('Browser Settings'),
	    layout: {
		type: 'vbox',
		align: 'right'
	    },
	    defaults: {
		width: '100%',
		margin: '0 0 10 0'
	    },
	    items: [
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Saved User name'),
		    labelAlign: 'left',
		    labelWidth: '50%',
		    fieldStyle: {
			'text-align':'right'
		    },
		    stateId: 'login-username',
		    reference: 'savedUserName',
		    value: ''
		},
		{
		    xtype: 'button',
		    text: gettext('Clear User name'),
		    width: 'auto',
		    name: 'clear-username'
		},
		{
		    xtype: 'box',
		    autoEl: { tag: 'hr'}
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Layout'),
		    labelAlign: 'left',
		    labelWidth: '50%'
		},
		{
		    xtype: 'button',
		    text: gettext('Reset Layout'),
		    width: 'auto',
		    name: 'reset'
		}
	    ]
    }],

    onShow: function() {
	var me = this;
	me.callParent();

    }
});
