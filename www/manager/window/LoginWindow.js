Ext.define('PVE.window.LoginWindow', {
    extend: 'Ext.window.Window',
    requires: ['PVE.form.RealmComboBox'],

    // private
    onLogon: function() {
	var me = this;

	var form = me.getComponent(0).getForm();

	if(form.isValid()){
            me.el.mask(gettext('Please wait...'), 'x-mask-loading');

	    form.submit({
		failure: function(f, resp){
		    me.el.unmask();
		    Ext.MessageBox.alert(gettext('Error'), 
					 gettext("Login failed. Please try again"), 
					 function() {
			var uf = form.findField('username');
			uf.focus(true, true);
		    });
		},
		success: function(f, resp){
		    me.el.unmask();
		    
		    var handler = me.handler || Ext.emptyFn;
		    handler.call(me, resp.result.data);
		    me.close();
		}
	    });
	}
    },

    initComponent: function() {
	var me = this;

	Ext.apply(me, {
	    width: 400,
	    modal: true,
	    border: false,
	    draggable: true,
	    closable: false,
	    resizable: false,
	    layout: 'auto',
	    title: gettext('Proxmox VE Login'),

	    items: [{
		xtype: 'form',
		frame: true,
		url: '/api2/extjs/access/ticket',

		fieldDefaults: {
		    labelAlign: 'right'
		},

		defaults: {
		    anchor: '-5',
		    allowBlank: false
		},
		
		items: [
		    { 
			xtype: 'textfield', 
			fieldLabel: gettext('User name'), 
			name: 'username',
			blankText: gettext("Enter your user name"),
			listeners: {
			    afterrender: function(f) {
				// Note: only works if we pass delay 1000
				f.focus(true, 1000);
			    },
			    specialkey: function(f, e) {
				if (e.getKey() === e.ENTER) {
				    var pf = me.query('textfield[name="password"]')[0];
				    if (pf.getValue()) {
					me.onLogon();
				    } else {
					pf.focus(false);
				    }
				}
			    }
			}
		    },
		    { 
			xtype: 'textfield', 
			inputType: 'password',
			fieldLabel: gettext('Password'), 
			name: 'password',
			blankText: gettext("Enter your password"),
			listeners: {
			    specialkey: function(field, e) {
				if (e.getKey() === e.ENTER) {
				    me.onLogon();
				}
			    }
			}
		    },
		    {
			xtype: 'pveRealmComboBox',
			name: 'realm'
		    },
		    {   
			xtype: 'pveLanguageSelector',
			fieldLabel: gettext('Language'), 
			value: Ext.util.Cookies.get('PVELangCookie') || 'en',
			name: 'lang',
			submitValue: false,
			listeners: {
			    change: function(t, value) {
				var dt = Ext.Date.add(new Date(), Ext.Date.YEAR, 10);
				Ext.util.Cookies.set('PVELangCookie', value, dt);
				me.el.mask(gettext('Please wait...'), 'x-mask-loading');
				window.location.reload();
			    }
			}
		    }
		],
		buttons: [
		    {
			text: gettext('Login'),
			handler: function(){
			    me.onLogon();
			}
		    }
		]
	    }]
	});

	me.callParent();
    }
});
