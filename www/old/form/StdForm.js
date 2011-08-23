Ext.ns("PVE.form");

PVE.form.StdForm = Ext.extend(Ext.FormPanel, {

    initComponent : function() {
	var self = this;

	// NOTE: If subclassing FormPanel, any configuration options for 
	// the BasicForm must be applied to initialConfig
	Ext.apply(self, Ext.apply(self.initialConfig, {
	    bodyStyle: 'padding:5px',
	    autoScroll: true,

 	    submitHandler: function(options) {

		var form = self.getForm();

		// NOTE: we add parameter for unset checkbox (because html 
		// does not sent them by default)
		var params = {};
		form.items.each(function(f) {
		    n = f.getName();
                    val = f.getValue();
		    xt = f.getXType();

		    if (xt === 'checkbox' && !val) {
			params[n] = 0;
		    }
		});
 
		if(form.isValid()){
		    self.el.mask('Please wait...', 'x-mask-loading');

		    form.submit({
			params: params,
			failure: function(f, resp){
			    self.el.unmask();
			    if (Ext.isFunction(options.failure)) {
				options.failure();
			    } else {
				var msg = "Please try again";
				if (resp.result && resp.result.message) {
				    msg = resp.result.message;
				} 
				Ext.MessageBox.alert('Failure', msg);
			    }
			},
			success: function(f, resp){
			    self.el.unmask();
			    if (Ext.isFunction(options.success)) {
				options.success();
			    } else {
				Ext.MessageBox.alert('Success', "Submit successful");
			    }
			}
		    });
		} else {
		    if (Ext.isFunction(options.failure)) {
			options.failure();
		    } else {
			Ext.MessageBox.alert('Failure', "Verify failed");
		    }
		}
	    }
	}));

	PVE.form.StdForm.superclass.initComponent.call(self);
    }
});

